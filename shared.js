/**
 * 任务栏歌词插件 - 共享常量和工具函数（文档参考）
 * 
 * ⚠️ 注意：插件沙箱不支持 ES module import，本文件仅作文档参考。
 * 实际代码运行的是 index.js 和 taskbar-lyric-window.js 中的内联副本。
 * 修改任何常量或工具函数时，请确保三处（本文件 + index.js + taskbar-lyric-window.js）同步更新。
 */

// ==================== 常量 ====================

/** 存储键名，用于持久化设置 */
export const STORAGE_KEY = "settings";

/** BroadcastChannel 频道名称，用于向浮窗同步设置 */
export const CHANNEL_NAME = "echo-plugin:taskbar-lyric:settings";

/** 浮窗窗口 ID，用于窗口管理 API */
export const WINDOW_ID = "taskbar-lyric";

/** 歌词刷新间隔（毫秒），80ms 提供流畅的逐字动画 */
export const LYRIC_CLOCK_INTERVAL_MS = 80;

/** 歌词前瞻时间（毫秒），提前 150ms 切换歌词，匹配人耳感知 */
export const LYRIC_LOOKAHEAD_MS = 150;

/** 默认任务栏高度（后备值，用于 screen API 不可用的场景） */
export const TASKBAR_FALLBACK_HEIGHT = 48;

// ==================== 默认设置 ====================

/** 默认设置对象（冻结，不可直接修改） */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,            // 是否启用插件
  doubleLine: true,         // 是否双行显示
  showCover: true,          // 是否显示封面
  coverSize: 36,            // 封面大小（像素）
  coverShape: "round",      // 封面形状：round-圆形 / square-方形
  coverPosition: "left",    // 封面位置：left-左侧 / right-右侧
  lyricFontSize: 14,        // 主歌词字号
  secondaryFontSize: 12,    // 副歌词字号
  fontFamily: "",           // 字体名称（空字符串使用系统默认）
  playedColor: "#31cfa1",   // 已播放歌词颜色
  unplayedColor: "#7a7a7a", // 未播放歌词颜色
  windowWidth: 400,         // 窗口宽度
  windowHeight: 40,         // 窗口高度（默认 40px，适配标准任务栏）
  taskbarOffsetX: 0,       // 水平偏移百分比（0=居中 ±100=贴边，自动适配不同分辨率）
  taskbarOffsetY: 0,       // 垂直偏移百分比（0=贴任务栏 ±100=屏幕高度/4）
  lockPosition: true,      // 锁定位置：true=鼠标穿透不可拖动 / false=可拖动调整
  manualAdjust: false,     // 手动调整：勾选后启用水平/垂直偏移滑块
  showTranslation: true,    // 是否显示翻译
  showRomanization: false,  // 是否显示音译
  emptyText: "EchoMusic",   // 无歌词时显示的文本
});

// ==================== 工具函数 ====================

/**
 * 数值钳制函数
 * @param {number} value - 输入值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 钳制后的值
 */
export const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));

/**
 * 归一化设置对象
 * 确保所有设置项都有有效的默认值，且值在合法范围内
 * @param {Object} value - 原始设置（可能部分字段缺失）
 * @returns {Object} 归一化后的完整设置对象
 */
export const normalizeSettings = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_SETTINGS,
    enabled: source.enabled ?? DEFAULT_SETTINGS.enabled,
    doubleLine: source.doubleLine ?? DEFAULT_SETTINGS.doubleLine,
    showCover: source.showCover ?? DEFAULT_SETTINGS.showCover,
    coverSize: clamp(source.coverSize ?? DEFAULT_SETTINGS.coverSize, 24, 64),
    coverShape: source.coverShape === "square" ? "square" : "round",
    coverPosition: source.coverPosition === "right" ? "right" : "left",
    lyricFontSize: clamp(source.lyricFontSize ?? DEFAULT_SETTINGS.lyricFontSize, 10, 24),
    secondaryFontSize: clamp(source.secondaryFontSize ?? DEFAULT_SETTINGS.secondaryFontSize, 10, 18),
    fontFamily: typeof source.fontFamily === "string" ? source.fontFamily : DEFAULT_SETTINGS.fontFamily,
    playedColor: typeof source.playedColor === "string" ? source.playedColor : DEFAULT_SETTINGS.playedColor,
    unplayedColor: typeof source.unplayedColor === "string" ? source.unplayedColor : DEFAULT_SETTINGS.unplayedColor,
    windowWidth: clamp(source.windowWidth ?? DEFAULT_SETTINGS.windowWidth, 200, 600),
    windowHeight: clamp(source.windowHeight ?? DEFAULT_SETTINGS.windowHeight, 24, 80),
    // 偏移为百分比，上限 100。旧版像素值（>100）自动迁移为 0
    taskbarOffsetX: clamp(source.taskbarOffsetX ?? DEFAULT_SETTINGS.taskbarOffsetX, -100, 100),
    taskbarOffsetY: clamp(source.taskbarOffsetY ?? DEFAULT_SETTINGS.taskbarOffsetY, -100, 100),
    lockPosition: source.lockPosition ?? DEFAULT_SETTINGS.lockPosition,
    showTranslation: source.showTranslation ?? DEFAULT_SETTINGS.showTranslation,
    showRomanization: source.showRomanization ?? DEFAULT_SETTINGS.showRomanization,
    emptyText: typeof source.emptyText === "string" ? source.emptyText : DEFAULT_SETTINGS.emptyText,
  };
};

/**
 * 检测任务栏信息
 * 使用 window.screen API 获取任务栏位置、尺寸和屏幕信息。
 * 仅在浮窗上下文中调用（index.js 运行在插件上下文中，无 window 对象）。
 * @returns {{ position: string, size: number, screenWidth: number, screenHeight: number }}
 */
export const detectTaskbarInfo = () => {
  if (typeof window === "undefined" || !window.screen) {
    return {
      position: "bottom",
      size: TASKBAR_FALLBACK_HEIGHT,
      screenWidth: 1920,
      screenHeight: 1080,
    };
  }

  const s = window.screen;
  const width = s.width || 1920;
  const height = s.height || 1080;
  const availLeft = s.availLeft || 0;
  const availTop = s.availTop || 0;
  const availWidth = s.availWidth || width;
  const availHeight = s.availHeight || height;

  let position = "bottom";
  let size = height - availHeight;

  if (availTop > 0) {
    position = "top";
    size = availTop;
  } else if (availLeft > 0) {
    position = "left";
    size = availLeft;
  } else if (availWidth < width) {
    position = "right";
    size = width - availWidth;
  }

  return { position, size, screenWidth: width, screenHeight: height };
};

/**
 * 根据任务栏检测结果和用户设置，计算窗口应放置的位置和尺寸。
 * 窗口贴靠到任务栏上方边缘。
 * @param {Object} settings - 用户设置（至少包含 windowWidth, windowHeight）
 * @returns {{ x: number, y: number, width: number, height: number, taskbar: Object }}
 */
export const computeWindowPosition = (settings) => {
  const taskbar = detectTaskbarInfo();
  const width = settings.windowWidth;
  // 窗口高度不能超过任务栏高度，否则会溢出
  const height = Math.min(settings.windowHeight, taskbar.size);

  let x = 0;
  let y = 0;

  switch (taskbar.position) {
    case "bottom":
      y = taskbar.screenHeight - taskbar.size;
      x = Math.max(0, Math.round((taskbar.screenWidth - width) / 2));
      break;
    case "top":
      y = taskbar.size;
      x = Math.max(0, Math.round((taskbar.screenWidth - width) / 2));
      break;
    case "left":
      x = taskbar.size;
      y = Math.max(0, Math.round((taskbar.screenHeight - height) / 2));
      break;
    case "right":
      x = taskbar.screenWidth - taskbar.size - width;
      y = Math.max(0, Math.round((taskbar.screenHeight - height) / 2));
      break;
    default:
      x = Math.round((taskbar.screenWidth - width) / 2);
      y = taskbar.screenHeight - taskbar.size;
  }

  // 百分比偏移 → 像素值（自动适配不同分辨率）
  // X: 百分比 × 半水平边距。±100% = 贴屏幕左/右边缘
  // Y: 百分比 × 屏幕高度/4。±100% = ±270px@1080p / ±360px@1440p
  const pctX = clamp(settings.taskbarOffsetX ?? 0, -100, 100);
  const pctY = clamp(settings.taskbarOffsetY ?? 0, -100, 100);
  const ox = Math.round((pctX / 100) * (taskbar.screenWidth - width) / 2);
  const oy = Math.round((pctY / 100) * Math.max(taskbar.screenHeight / 4, taskbar.size * 3));

  // 正百分比 = 远离任务栏边缘，即向屏幕内侧移动
  switch (taskbar.position) {
    case "bottom":
      y -= oy;  // 正 = 向上
      x += ox;  // 正 = 向右
      break;
    case "top":
      y += oy;  // 正 = 向下
      x += ox;
      break;
    case "left":
      x += ox;  // 正 = 向右
      y += oy;
      break;
    case "right":
      x -= ox;  // 正 = 向左
      y += oy;
      break;
    default:
      y -= oy;
      x += ox;
  }

  return { x, y, width, height, taskbar };
};
