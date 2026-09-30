/**
 * 桌面端（Electron 壳）冒烟测试 —— 只钉桌面分支与浏览器分支的差异。
 *
 * 为什么单独一个文件：`dshDesktop` 的存在与否决定渲染分支，而同一个 Node 进程里
 * 全局一旦装上就撤不掉；client-half.smoke.mjs 跑的是纯浏览器路径，两边不能混。
 * 这里自带一份最小桩（不 import 那边的东西），改任何一边都不会把另一边带崩。
 *
 * 覆盖：
 *   1. 判定：只有 `{ protocolVersion: 1, deviceInfo }` 才算桌面端主框架 ——
 *      浏览器（无全局）、壳内嵌 iframe（只有 protocolVersion）、协议版本不匹配 都不算
 *   2. 桌面端**不画**鲸鱼状态灯分组（没有标签页图标），整行可点的分组只剩「系统通知」
 *   3. 桌面端画说明行 + 「发送测试通知」按钮，点它真的走 Notification
 *   4. permission 拿不到 granted 时，桌面端弹**系统设置指引** chip，而不是浏览器授权按钮
 *   5. 桌面端**不挂**首次手势自动授权（宿主的 session 处理器本来就放行，没有授权窗可弹）
 *   6. 浏览器分支回归：同一份 bundle 在无 `dshDesktop` 时仍然是 3 个取色器 + 2 个分组
 *
 * 刻意**不测**「打开系统设置」：壳不开放外开能力，1.5.0 做的入口点了没反应，已删除
 * （取证见 lib/client.cjs 里那段注释）。将来壳开放能力再加回按钮与测试。
 *
 * 用法：node test/desktop-half.smoke.mjs
 * 退出码 0 = 全部通过；1 = 有失败项。
 */
import { readFileSync } from "node:fs";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${name}${detail === "" ? "" : ` — ${detail}`}`);
  if (!ok) failed += 1;
};

/* ==================== 环境桩 ==================== */
/** 设置快照（插件只读它，写入在本测试里不重要）。 */
const settingsValue = { notifyEnabled: true };
/** zh / en 字典（断言 key 集合一致用）。 */
const strings = {};
const stringsEn = {};
/** 本轮装出来的设置页组件渲染出的 jsx 节点。 */
let jsxNodes = [];
/** 布尔 state 的 setter（展开态）；桌面端应当只剩「系统通知」那一个。 */
let boolSetters = [];
/** Notification 构造记录。 */
const notifications = [];
/** 请求过通知权限的次数（桌面端必须为 0）。 */
let permissionRequests = 0;

class FakeNotification {
  constructor(title, options) {
    this.title = title;
    this.options = options ?? {};
    notifications.push(this);
  }
  close() {}
}
FakeNotification.permission = "granted";
FakeNotification.requestPermission = () => {
  permissionRequests += 1;
  return Promise.resolve("granted");
};

/** 假 document：插件用到的选择器全部返回 null/空，够 apply 与设置页渲染跑完。 */
const documentListeners = new Map();
const fakeDocument = {
  head: {
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: (element) => element
  },
  createElement: (tagName) => ({ tagName, rel: "", type: "", href: "" }),
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: {},
  addEventListener: (type, fn) => {
    const list = documentListeners.get(type) ?? [];
    list.push(fn);
    documentListeners.set(type, list);
  },
  removeEventListener: (type, fn) => {
    const list = documentListeners.get(type);
    if (list === void 0) return;
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  },
  hasFocus: () => false
};
Object.defineProperty(fakeDocument, "visibilityState", { get: () => "hidden" });

globalThis.document = fakeDocument;
globalThis.window = globalThis;
globalThis.Notification = FakeNotification;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = () => 0;
class FakeBroadcastChannel {
  constructor() {}
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  close() {}
  unref() {}
}
globalThis.BroadcastChannel = FakeBroadcastChannel;
class FakeAudio {
  constructor(src) {
    this.src = src;
    this.volume = 1;
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}
globalThis.Audio = FakeAudio;

const jsx = (type, props) => {
  const node = { type, props: props ?? {} };
  jsxNodes.push(node);
  return node;
};
/** primitives：只要名字对得上就返回标记组件（名字都取自官方 0.2.0-rc.2 的真实导出）。 */
const primitivesStub = new Proxy({}, {
  get: (_target, name) => {
    const marker = (props) => ({ primitive: String(name), props: props ?? {} });
    marker.__primitive = String(name);
    return marker;
  }
});
const clientStoreStub = {
  createSnapshotStore: (init) => {
    let state = init;
    return {
      getSnapshot: () => state,
      set: (next) => {
        state = next;
      },
      update: (mutator) => {
        mutator(state);
      },
      subscribe: () => () => {}
    };
  }
};
const requireMock = (name) => {
  if (name === "@deepseek-ai/dsh-client-ui-primitives") return primitivesStub;
  if (name === "@deepseek-ai/dsh-client-store") return clientStoreStub;
  if (name === "react") return {
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useState: (init) => {
      const setter = () => {};
      setter.calls = [];
      if (typeof init === "boolean") boolSetters.push(setter);
      /* 布尔初值一律返回 true：折叠分组默认是**展开**的，子项才会渲染出来
         （与 client-half.smoke.mjs 的桩保持一致，否则取色器/滑杆一个都看不到）。 */
      return [typeof init === "boolean" ? true : init, setter];
    },
    useRef: () => ({ current: void 0 }),
    useEffect: () => {}
  };
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  return {};
};

/* ==================== 按模式装配并渲染 ==================== */
/** 注册进 slots 的设置页组件（每次装配会换人）。 */
let registeredSection = null;
/** 设置条目：桌面端与浏览器端共用同一份假 scope。
 *  写入必须真的改到 settingsValue —— 官方 configForms 的 set/unset 就是这个语义，
 *  「输入框写了一笔」这类断言靠它落地（返回 Promise<true> = 宿主已接受）。 */
const scope = {
  getSnapshot: () => ({ status: "ready", value: settingsValue, writable: true, revision: 1 }),
  subscribe: () => () => {},
  set: (key, value) => {
    settingsValue[key] = value;
    return Promise.resolve(true);
  },
  unset: (key) => {
    delete settingsValue[key];
    return Promise.resolve(true);
  }
};
/**
 * 装一份新的插件实例并渲染设置页。
 * @param desktop - 要注入的 `dshDesktop` 值；null 表示浏览器（根本没有这个全局）。
 * @returns 设置页组件渲染出的根节点。
 */
const renderSection = (desktop) => {
  jsxNodes = [];
  boolSetters = [];
  registeredSection = null;
  /* 每次装配前清掉上一实例留在 document 上的监听：apply 会挂 visibilitychange / focus 等，
     而「有没有挂首次手势授权」这条断言必须只看当前这一个实例。 */
  documentListeners.clear();
  if (desktop === null) delete globalThis.dshDesktop;
  else globalThis.dshDesktop = desktop;

  const loaded = [];
  globalThis.__ModuleLoader__ = { load: (record) => loaded.push(record) };
  const source = readFileSync(new URL("../lib/client.cjs", import.meta.url), "utf8");
  new Function(source)();
  const client = loaded[0]?.factory(requireMock);
  if (typeof client?.apply !== "function") throw new Error("bundle 没有导出 apply()");

  const ctx = {
    sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } },
    configForms: { get: () => scope },
    inject: () => {},
    effect: (fn) => {
      fn();
    },
    locale: {
      bind: () => (key) => strings[key] ?? key,
      register: (_ns, dicts) => {
        Object.assign(strings, dicts.zh);
        Object.assign(stringsEn, dicts.en);
      }
    },
    slots: {
      inject: (_name, callback) => {
        callback();
      },
      register: (_options, component) => {
        registeredSection = component;
        return {};
      }
    }
  };
  client.apply(ctx);
  if (typeof registeredSection !== "function") throw new Error("设置页没有注册到 slots");
  return registeredSection({ scope, t: (key) => strings[key] ?? key });
};

const colorInputs = () => jsxNodes.filter((node) => node.props?.type === "color").length;
const PROTOCOL_VERSION = 1;
const DESKTOP_API = { protocolVersion: PROTOCOL_VERSION, deviceInfo: () => Promise.resolve({}) };

/* ==================== 1. 判定：三种「不是桌面端」 ==================== */
/* 浏览器：没有 dshDesktop */
renderSection(null);
check("浏览器渲染 3 个取色器（= 仍是原浏览器形态）", colorInputs() === 3, String(colorInputs()));
check("浏览器有 2 个折叠分组", boolSetters.length === 2, String(boolSetters.length));
check("浏览器没有桌面端说明行", !jsxNodes.some((node) => node.props?.children === strings.desktopGroupTitle), String(strings.desktopGroupTitle));

/* 壳内嵌 iframe：只有 protocolVersion，没有能力函数 */
renderSection({ protocolVersion: PROTOCOL_VERSION });
check("iframe 里的 { protocolVersion } 不算桌面端", colorInputs() === 3, String(colorInputs()));

/* 协议版本不匹配：能力齐全也不认 */
renderSection({ ...DESKTOP_API, protocolVersion: PROTOCOL_VERSION + 1 });
check("协议版本不匹配不算桌面端", colorInputs() === 3, String(colorInputs()));

/* ==================== 2-5. 桌面端主框架 ==================== */
permissionRequests = 0;
notifications.length = 0;
const sectionTree = renderSection(DESKTOP_API);

check("桌面端不渲染任何取色器（没有标签页图标）", colorInputs() === 0, String(colorInputs()));
const clickableRows = sectionTree?.props?.children?.filter((node) => typeof node?.props?.onClick === "function") ?? [];
check("桌面端没有鲸鱼状态灯分组（整行可点的分组只剩通知一个）", clickableRows.length === 1, String(clickableRows.length));
check("桌面端画了说明行标题", jsxNodes.some((node) => node.props?.children === strings.desktopGroupTitle), String(strings.desktopGroupTitle));
check("桌面端说明里点明通知由系统决定", jsxNodes.some((node) => node.props?.children === strings.desktopSystemHint), String(strings.desktopSystemHint));

const testButton = jsxNodes.find((node) => node.type === "button" && node.props?.["aria-label"] === strings.notifyTest);
check("桌面端有「发送测试通知」按钮", testButton !== void 0, String(strings.notifyTest));
testButton?.props?.onClick?.();
check("点测试通知 → 真的构造了一条通知", notifications.length === 1, String(notifications.length));
check("测试通知用专门的文案", notifications[0]?.title === strings.notifyTestTitle && notifications[0]?.options?.body === strings.notifyTestBody, JSON.stringify([notifications[0]?.title, notifications[0]?.options?.body]));
check("测试通知不发声（声音归音效那几行）", notifications[0]?.options?.silent === true, String(notifications[0]?.options?.silent));
check("测试通知仍带鲸鱼图标", String(notifications[0]?.options?.icon).startsWith("data:image/svg+xml,"), String(notifications[0]?.options?.icon).slice(0, 24));


/* ==================== 4. 桌面端的权限提示是指引，不是授权按钮 ==================== */
/* FakeNotification.permission = "granted" 时按设计不画 chip，所以这里临时改成 "default"
   重装一次，专门看桌面端的 chip 形态。 */
FakeNotification.permission = "default";
permissionRequests = 0;
jsxNodes = [];
boolSetters = [];
const defaultPermissionTree = renderSection(DESKTOP_API);
const desktopChip = jsxNodes.find((node) => node.props?.children?.props?.children === strings.permissionDesktopChip
  || (Array.isArray(node.props?.children) && node.props.children.some((child) => child?.props?.children === strings.permissionDesktopChip)));
check("桌面端 permission=default 时画权限指引 chip", desktopChip !== void 0, JSON.stringify(jsxNodes.map((node) => node.props?.children).slice(0, 3)));
check("桌面端 chip 不是可点的授权按钮", !jsxNodes.some((node) => node.type === "button" && node.props?.children?.props?.children === strings.permissionPendingChip));
check("桌面端 chip 在「系统通知」分组内渲染（整棵树照常产出）", defaultPermissionTree !== null);

/* ==================== 5. 桌面端不挂手势授权 ==================== */
const gestureListeners = (documentListeners.get("pointerdown") ?? []).length + (documentListeners.get("keydown") ?? []).length;
check("桌面端没有挂首次手势自动授权", gestureListeners === 0, String(gestureListeners));
check("桌面端没有请求过通知权限", permissionRequests === 0, String(permissionRequests));
FakeNotification.permission = "granted";

/* ==================== 6. 文案 ==================== */
check("zh / en 文案 key 集合一致", JSON.stringify(Object.keys(strings).sort()) === JSON.stringify(Object.keys(stringsEn).sort()), `zh=${Object.keys(strings).length} en=${Object.keys(stringsEn).length}`);
for (const key of ["desktopGroupTitle", "desktopGroupHint", "desktopSystemHint", "notifyTest", "notifyTestHint", "notifyTestTitle", "notifyTestBody", "permissionDesktopChip", "permissionDesktopHint"]) {
  check(`桌面端文案 ${key} 已注册且非裸 key`, typeof strings[key] === "string" && strings[key] !== key, String(strings[key]));
}

console.log(failed === 0 ? "\n全部通过" : `\n有 ${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
