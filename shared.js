/**
 * 任务栏歌词插件 - 共享常量与工具函数
 * 
 * 本文件是 DEFAULT_SETTINGS、normalizeSettings 等常量和工具函数的权威定义。
 * index.js 和 taskbar-lyric-window.js 各自内联一份副本。
 * 修改常量时请同步更新三处。
 */

// ==================== 常量 ====================

/** 存储键名，用于持久化设置 */
export const STORAGE_KEY = "settings";

/** BroadcastChannel 频道名称，用于向浮窗同步设置 */
export const CHANNEL_NAME = "echo-plugin:taskbar-lyric:settings";

/** 浮窗窗口 ID，用于窗口管理 API */
export const WINDOW_ID = "taskbar-lyric";

/** 默认设置对象 */
export const DEFAULT_SETTINGS = {
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
  taskbarOffsetX: 0,        // 水平偏移百分比（0=居中 ±100=贴边，自动适配不同分辨率）
  taskbarOffsetY: 0,        // 垂直偏移百分比（0=贴任务栏 ±100=屏幕高度/4）
  lockPosition: true,       // 锁定位置：true=鼠标穿透不可拖动 / false=可拖动调整
  manualAdjust: false,      // 手动调整：勾选后启用水平/垂直偏移滑块
  showTranslation: true,    // 是否显示翻译
  showRomanization: false,  // 是否显示音译
  secondaryScroll: false,   // 副歌词是否启用跑马灯滚动
  lyricFilterEnabled: false, // 是否启用歌词正则过滤
  lyricFilterPatterns: "作词|作曲|编曲|制作人|混音|母带|录音|和声|监制|出品|发行|版权|OP|SP|企划|统筹", // 过滤正则模式
  emptyText: "EchoMusic",   // 无歌词时显示的文本
};

// ==================== 工具函数 ====================

/**
 * 数值钳制函数
 */
export const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));

/**
 * 归一化设置对象
 * 确保所有设置项都有有效的默认值，且值在合法范围内
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
    taskbarOffsetX: clamp(source.taskbarOffsetX ?? DEFAULT_SETTINGS.taskbarOffsetX, -100, 100),
    taskbarOffsetY: clamp(source.taskbarOffsetY ?? DEFAULT_SETTINGS.taskbarOffsetY, -100, 100),
    lockPosition: source.lockPosition ?? DEFAULT_SETTINGS.lockPosition,
    manualAdjust: source.manualAdjust ?? DEFAULT_SETTINGS.manualAdjust,
    showTranslation: source.showTranslation ?? DEFAULT_SETTINGS.showTranslation,
    showRomanization: source.showRomanization ?? DEFAULT_SETTINGS.showRomanization,
    secondaryScroll: source.secondaryScroll ?? DEFAULT_SETTINGS.secondaryScroll,
    lyricFilterEnabled: source.lyricFilterEnabled ?? DEFAULT_SETTINGS.lyricFilterEnabled,
    lyricFilterPatterns: typeof source.lyricFilterPatterns === "string" ? source.lyricFilterPatterns : DEFAULT_SETTINGS.lyricFilterPatterns,
    emptyText: typeof source.emptyText === "string" ? source.emptyText : DEFAULT_SETTINGS.emptyText,
  };
};
