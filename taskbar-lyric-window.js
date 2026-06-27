/**
 * 任务栏歌词插件 - 浮窗入口
 * 在任务栏上方显示当前歌词和专辑封面的透明浮窗。
 * 自动检测任务栏位置并贴靠,无需手动设置坐标。
 *
 * 共享常量和工具定义在 ./shared.js 中。
 * 由于浮窗运行在独立上下文中,本文件内联了一份最小副本。
 */

// ==================== 内联常量(与 shared.js 保持一致) ====================

/** BroadcastChannel 频道名称,用于接收主插件的设置同步 */
const CHANNEL_NAME = "echo-plugin:taskbar-lyric:settings";

/** 歌词刷新间隔(毫秒), 33ms ≈30fps,与 marquee 60fps 差距缩小 4 倍,避免视觉抖晃 */
const LYRIC_CLOCK_INTERVAL_MS = 33;

/** 歌词前瞻时间(毫秒),提前 150ms 切换歌词,匹配人耳感知 */
const LYRIC_LOOKAHEAD_MS = 150;

/** 默认任务栏高度(后备值) */
const TASKBAR_FALLBACK_HEIGHT = 48;

/** 默认设置(与 shared.js DEFAULT_SETTINGS 同步) */
const DEFAULT_SETTINGS = {
  enabled: true,
  doubleLine: true,
  showCover: true,
  coverSize: 36,
  coverShape: "round",
  coverPosition: "left",
  lyricFontSize: 14,
  secondaryFontSize: 12,
  fontFamily: "",
  playedColor: "#31cfa1",
  unplayedColor: "#7a7a7a",
  windowWidth: 400,
  windowHeight: 40,
  taskbarOffsetX: 0,
  taskbarOffsetY: 0,
  lockPosition: true,
  manualAdjust: false,
  showTranslation: true,
  showRomanization: false,
  secondaryScroll: false,
  lyricFilterEnabled: false,
  lyricFilterPatterns: "作词|作曲|编曲|制作人|混音|母带|录音|和声|监制|出品|发行|版权|OP|SP|企划|统筹",
  emptyText: "EchoMusic",
};

// ==================== 工具函数 ====================

/** 数值钳制 */
const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));


/**
 * 检测任务栏信息
 * 使用 window.screen API 推断任务栏位置和尺寸。
 * @returns {{ position: string, size: number, screenWidth: number, screenHeight: number }}
 */
const detectTaskbarInfo = () => {
  const s = window.screen || {};
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

  // 后备:如果计算出的 taskbar 高度为 0 或异常大,使用默认值
  if (size <= 0 || size > 200) {
    size = TASKBAR_FALLBACK_HEIGHT;
    position = "bottom";
  }

  return { position, size, screenWidth: width, screenHeight: height };
};

/**
 * 根据任务栏检测结果和用户设置,计算窗口应放置的位置和尺寸。
 * 窗口贴靠到任务栏上方边缘(占据任务栏区域顶部)。
 * @param {Object} settings - 用户设置
 * @returns {{ x: number, y: number, width: number, height: number, taskbar: Object }}
 */
const computeWindowBounds = (settings) => {
  const taskbar = detectTaskbarInfo();
  const width = settings.windowWidth;
  // 窗口高度不能超过任务栏高度,否则会溢出到工作区
  const height = Math.min(settings.windowHeight, taskbar.size);

  let x = 0;
  let y = 0;

  switch (taskbar.position) {
    case "bottom":
      // 贴靠在屏幕底部任务栏上方边缘
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

  // 百分比偏移 → 像素值(有偏移就应用,不依赖手动调整开关)
  const pctX = clamp(settings.taskbarOffsetX ?? 0, -100, 100);
  const pctY = clamp(settings.taskbarOffsetY ?? 0, -100, 100);
  const ox = Math.round((pctX / 100) * (taskbar.screenWidth - width) / 2);
  const oy = Math.round((pctY / 100) * Math.max(taskbar.screenHeight / 4, taskbar.size * 3));

  // 正百分比 = 远离任务栏边缘,即向屏幕内侧移动
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

/**
 * 定位窗口到任务栏上方
 * @param {Object} ctx - 插件上下文
 * @param {Object} settings - 用户设置
 */
const positionToTaskbar = (ctx, settings) => {
  // 解锁状态下不强制定位,由用户拖拽自由控制窗口位置
  if (!settings.lockPosition) return;
  try {
    const bounds = computeWindowBounds(settings);
    ctx.window.move({
      x: bounds.x,
      y: bounds.y,
    });
  } catch (error) {
    console.warn("[taskbar-lyric] 窗口定位失败", error);
  }
};

// ==================== 歌词处理 ====================

/**
 * 根据播放状态推算当前播放时间(毫秒)
 */
const getEstimatedPlaybackMs = (playback) => {
  if (!playback) return 0;
  const baseMs = Math.max(0, Number(playback.currentTime || 0) * 1000);
  if (!playback.isPlaying) return baseMs;
  const updatedAt = Number(playback.updatedAt || Date.now());
  const playbackRate = Math.max(0.1, Number(playback.playbackRate || 1));
  const elapsedMs = Math.max(0, Date.now() - updatedAt) * playbackRate;
  const durationMs = Math.max(0, Number(playback.duration || 0) * 1000);
  const seekMs = baseMs + elapsedMs;
  return durationMs > 0 ? Math.min(seekMs, durationMs) : seekMs;
};

const getLyricSeekMs = (snapshot) =>
  getEstimatedPlaybackMs(snapshot.playback) +
  Number(snapshot.lyric?.timeOffset || 0);

const getLineStartMs = (line) => {
  const charStart = line?.characters?.[0]?.startTime;
  if (Number.isFinite(charStart)) return charStart;
  return Math.round((Number(line?.time) || 0) * 1000);
};

/** 计算当前行播放进度(0–1),用于驱动滚动位置
 *  @param line      歌词行对象
 *  @param lineIndex 行索引
 *  @param allLines  全部歌词行
 *  @param seekMs    当前播放位置(毫秒)
 *  @returns {number} 0–1 之间的进度值 */
const getLineProgress = (line, lineIndex, allLines, seekMs) => {
  if (!line || !allLines?.length) return 0;
  const lineStart = getLineStartMs(line);
  const chars = line.characters || [];
  let lineEnd;
  if (chars.length > 0) {
    lineEnd = chars[chars.length - 1]?.endTime ?? 0;
  }
  if (!lineEnd || lineEnd <= lineStart) {
    const nextIdx = lineIndex + 1;
    lineEnd = nextIdx < allLines.length ? getLineStartMs(allLines[nextIdx]) : lineStart + 5000;
  }
  const duration = Math.max(lineEnd - lineStart, 1);
  return Math.max(0, Math.min(1, (seekMs - lineStart) / duration));
};

const calculateLineIndex = (lines, seekMs) => {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  let index = -1;
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (seekMs >= getLineStartMs(lines[mid])) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return index;
};

/** 从指定索引起查找第一个未被过滤的可见行索引
 *  供 tickLyric 和 nextLine 使用，在过滤启用时跳过匹配正则的行
 *  @returns {number} 原始行索引（若全部匹配则返回最后一行降级显示） */

// 缓存编译后的正则，避免每 33ms 重新编译
let _filterRegexCache = null;
let _filterRegexSource = null;

const findNextVisibleIndex = (fromIndex, lines, settings) => {
  if (!settings.lyricFilterEnabled || !settings.lyricFilterPatterns?.trim()) return fromIndex;
  if (fromIndex < 0 || !lines || fromIndex >= lines.length) return fromIndex;
  try {
    const pattern = settings.lyricFilterPatterns;
    if (_filterRegexSource !== pattern) {
      _filterRegexSource = pattern;
      _filterRegexCache = new RegExp(pattern, 'i');
    }
    const regex = _filterRegexCache;
    let i = fromIndex;
    while (i < lines.length) {
      const text = String(lines[i]?.text || "").trim();
      if (!regex.test(text)) return i;
      i++;
    }
    // 全部后续行均匹配，返回最后一行降级显示
    return lines.length - 1;
  } catch {
    // 正则无效时不做过滤
    return fromIndex;
  }
};

/**
 * 获取副文本内容
 * 返回对象 { text, type },type 用于区分翻译/音译和下一行歌词
 */
const getSecondaryText = (lyric, line, nextLine, settings) => {
  if (!line) return null;

  const translated = String(line.translated || "").trim();
  if (settings.showTranslation && lyric?.wantTranslation && lyric?.hasTranslation && translated) {
    return { text: translated, type: "translation" };
  }

  const romanized = String(line.romanized || "").trim();
  if (settings.showRomanization && lyric?.wantRomanization && lyric?.hasRomanization && romanized) {
    return { text: romanized, type: "romanization" };
  }

  if (settings.doubleLine && nextLine) {
    return { text: String(nextLine.text || "").trim(), type: "nextLine" };
  }

  return null;
};

const isYrcLine = (line) => (line?.characters?.length ?? 0) > 1;

// ==================== 应用入口 ====================

/**
 * 激活浮窗窗口
 * @param {Object} ctx - EchoMusic 窗口上下文
 */
export function activateWindow(ctx) {
  const { h, createApp, ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = ctx.vue;

  const App = {
    setup() {
      // 设置状态(响应式)
      const settings = reactive({ ...DEFAULT_SETTINGS });

      // 歌词状态
      const snapshot = ref(null);
      const currentIndex = ref(-1);
      let snapshotDispose = null;
      let clockTimer = null;
      let channel = null;
      let receivedFromChannel = false; // 防止竞态:标记是否已从 channel 收到设置
      let settingsSyncTimer = null;    // storage 轮询定时器(BroadcastChannel 后备)
      let lastSettingsHash = "";       // 上次轮询到的设置 hash,避免重复更新

      /**
       * 设置 BroadcastChannel 监听
       * 接收来自主插件(index.js)的设置同步。
       * 修复竞态:先建立 channel 监听,再用 storage 作为初始回退。
       */
      const setupChannel = () => {
        if (typeof BroadcastChannel !== "function") return;
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event) => {
          const payload = event.data;
          if (!payload || payload.type !== "settings") return;
          receivedFromChannel = true;
          Object.assign(settings, payload.settings);
          // BroadcastChannel 可用，停止 storage 轮询空转
          if (settingsSyncTimer) { clearInterval(settingsSyncTimer); settingsSyncTimer = null; }
        };
      };

      /**
       * 刷新歌词进度
       */
      const tickLyric = () => {
        const snap = snapshot.value;
        if (!snap) return;
        const lines = snap.lyric?.lines ?? [];
        const seekMs = getLyricSeekMs(snap) + LYRIC_LOOKAHEAD_MS;
        const idx = calculateLineIndex(lines, seekMs);
        const rawIndex = idx >= 0 ? idx : (snap.lyric?.currentIndex ?? -1);
        // 应用正则过滤，跳过匹配的歌词行（制作信息、版权信息等）
        currentIndex.value = findNextVisibleIndex(rawIndex, lines, settings);
        // 每帧驱动滚动位置,取代 CSS animation
        updateScrollPosition();
      };

      // 当前歌词行
      const currentLine = computed(() => {
        const lines = snapshot.value?.lyric?.lines ?? [];
        return lines[currentIndex.value] ?? null;
      });

      // 下一行歌词(用于双行模式副文本，过滤时跳过被忽略的行)
      const nextLine = computed(() => {
        const lines = snapshot.value?.lyric?.lines ?? [];
        const startIdx = currentIndex.value + 1;
        if (startIdx >= lines.length) return null;
        const visibleIdx = findNextVisibleIndex(startIdx, lines, settings);
        return lines[visibleIdx] ?? null;
      });

      // 主歌词文本
      const currentText = computed(() => {
        if (!currentLine.value) return settings.emptyText || "";
        return String(currentLine.value.text || "").trim();
      });

      // 副歌词信息
      const secondaryInfo = computed(() =>
        getSecondaryText(snapshot.value?.lyric, currentLine.value, nextLine.value, settings),
      );

      const secondaryText = computed(() => secondaryInfo.value?.text || "");

      // ==================== 歌词滚动溢出检测 ====================

      /** 溢出状态标记 */
      const primaryOverflow = ref(false);
      const secondaryOverflow = ref(false);
      /** 溢出像素量,由 checkOverflow 计算,供进度驱动滚动使用 */
      const primaryOverflowPx = ref(0);
      const secondaryOverflowPx = ref(0);
      /** 滚动元素 DOM 引用(回调 ref) */
      let primaryScrollEl = null;
      let secondaryScrollEl = null;

      /** 检测歌词溢出,存储溢出像素量供进度驱动滚动使用
       *  ⚠️ .tb-lyric-scroll 是 inline-block 无宽度约束,自身 clientWidth 永远==scrollWidth
       *     溢出检测必须用父容器(.tb-lyric-primary)的 clientWidth 来做判断 */
      const checkOverflow = () => {
        // 主歌词
        if (primaryScrollEl) {
          const container = primaryScrollEl.parentElement;
          const overflow = primaryScrollEl.scrollWidth > container.clientWidth + 1;
          primaryOverflow.value = overflow;
          if (overflow) {
            primaryOverflowPx.value = primaryScrollEl.scrollWidth - container.clientWidth;
          }
        }
        // 副歌词（始终检测溢出，翻译/音译自动跟随主歌词滚动，下一行预览由 secondaryScroll 控制）
        if (secondaryScrollEl) {
          const container = secondaryScrollEl.parentElement;
          const overflow = secondaryScrollEl.scrollWidth > container.clientWidth + 1;
          secondaryOverflow.value = overflow;
          if (overflow) {
            secondaryOverflowPx.value = secondaryScrollEl.scrollWidth - container.clientWidth;
          }
        }
        // 溢出量更新后立即修正滚动位置
        updateScrollPosition();
      };

      /** 按播放进度驱动歌词滚动位置
       *  取代 CSS animation 方案,解决两个 bug:
       *  1. 长歌词已播到后半段,滚动却从最前重新开始
       *  2. 两个长句衔接时,第二句先展示末尾再跳回开头
       *  原理: translateX = -overflowPx × progress,每 33ms 更新 */
      const updateScrollPosition = () => {
        const snap = snapshot.value;
        if (!snap) return;
        const allLines = snap.lyric?.lines ?? [];
        const seekMs = getLyricSeekMs(snap);

        // 主歌词进度驱动滚动
        if (primaryScrollEl) {
          if (primaryOverflow.value && primaryOverflowPx.value > 0) {
            const progress = getLineProgress(currentLine.value, currentIndex.value, allLines, seekMs);
            primaryScrollEl.style.transform = `translateX(${-primaryOverflowPx.value * progress}px)`;
          } else {
            primaryScrollEl.style.transform = '';
          }
        }

        // 副歌词进度驱动滚动
        // 翻译/音译 → 始终跟随主歌词同步滚动（不受 secondaryScroll 开关控制）
        // 下一行预览 → 需用户开启 secondaryScroll 才滚动
        if (secondaryScrollEl) {
          if (secondaryOverflow.value && secondaryOverflowPx.value > 0) {
            const info = secondaryInfo.value;
            const isTranslation = info?.type === "translation" || info?.type === "romanization";
            const shouldScroll = isTranslation || settings.secondaryScroll;
            if (shouldScroll) {
              // 翻译/音译与主歌词使用同一进度，视觉上同步滚动
              const lineForProgress = isTranslation ? currentLine.value : nextLine.value;
              const lineIdx = isTranslation ? currentIndex.value : currentIndex.value + 1;
              const progress = getLineProgress(lineForProgress, lineIdx, allLines, seekMs);
              secondaryScrollEl.style.transform = `translateX(${-secondaryOverflowPx.value * progress}px)`;
            } else {
              secondaryScrollEl.style.transform = '';
            }
          } else {
            secondaryScrollEl.style.transform = '';
          }
        }
      };

      // 封面 URL
      const coverUrl = computed(() =>
        snapshot.value?.playback?.cover || snapshot.value?.playback?.coverUrl || "",
      );

      // ==================== 悬停控件 (v3) ====================
      /**
       *  v3 策略：mouseenter 做主触发 + 一次性 mousemove 兜底
       *  ① mouseenter 只在边界跨越时触发 = 明确交互意图，不会误触
       *  ② 80ms 延迟 setIgnoreMouseEvents(false) + 可取消：80ms 内 mouseleave 则放弃
       *  ③ 挂载后 600ms 内短暂监听 mousemove：检测鼠标是否已在窗口上方
       *  ④ 双路 mouseleave（root + document）确保离开检测可靠
       */
      // ——— 进入/离开状态管理 ———
      const isHovered = ref(false);
      let leaveDebounce = null;
      let hoverModeTimer = null;
      let isHoverModeActive = false; // 保证 enter/leave 对称，防双重调用竞态
      let watchDogTimer = null;       // mousemove 心跳：3s 无动静 = 强制复位

      const cancelHoverTimer = () => {
        if (hoverModeTimer) { clearTimeout(hoverModeTimer); hoverModeTimer = null; }
      };

      const armWatchDog = () => {
        disarmWatchDog();
        watchDogTimer = setTimeout(() => {
          forceLeave();
        }, 3000);
      };
      const disarmWatchDog = () => {
        if (watchDogTimer) { clearTimeout(watchDogTimer); watchDogTimer = null; }
      };
      const onWatchDogMove = () => {
        if (isHovered.value) armWatchDog();
      };

      /** 强制离开 — 重置所有状态，恢复鼠标穿透 */
      const forceLeave = () => {
        disarmWatchDog();
        cancelHoverTimer();
        if (leaveDebounce) { clearTimeout(leaveDebounce); leaveDebounce = null; }
        isHovered.value = false;
        isHoverModeActive = false;
        document.removeEventListener('mousemove', onWatchDogMove);
        if (settings.lockPosition) {
          ctx.window.setIgnoreMouseEvents(true, { forward: true });
        } else {
          ctx.window.setIgnoreMouseEvents(false);
        }
      };

      // mouseenter 为主触发：每次边界跨越都重新启动 80ms 定时器
      const onMouseEnter = () => {
        if (!isHoverModeActive) {
          isHoverModeActive = true;
          document.addEventListener('mousemove', onWatchDogMove);
        }
        if (leaveDebounce) { clearTimeout(leaveDebounce); leaveDebounce = null; }
        cancelHoverTimer();
        isHovered.value = true;
        // 80ms 后切交互模式，可被 mouseleave 取消
        hoverModeTimer = setTimeout(() => {
          hoverModeTimer = null;
          if (isHovered.value && !leaveDebounce) {
            ctx.window.setIgnoreMouseEvents(false);
            armWatchDog();
          }
        }, 80);
      };

      // ——— 离开 debounce ———
      const startLeaveDebounce = () => {
        if (!isHoverModeActive) return; // 已在离开流程中
        cancelHoverTimer();
        if (leaveDebounce) clearTimeout(leaveDebounce);
        leaveDebounce = setTimeout(() => {
          leaveDebounce = null;
          isHovered.value = false;
          isHoverModeActive = false;
          disarmWatchDog();
          document.removeEventListener('mousemove', onWatchDogMove);
          if (settings.lockPosition) {
            ctx.window.setIgnoreMouseEvents(true, { forward: true });
          } else {
            ctx.window.setIgnoreMouseEvents(false);
          }
        }, 150);
      };

      const onRootMouseLeave = () => { startLeaveDebounce(); };
      const onDocMouseLeave = () => { startLeaveDebounce(); };

      /** 切换锁定状态(控件栏锁按钮) */
      const toggleLock = async () => {
        const nextLock = !settings.lockPosition;
        settings.lockPosition = nextLock;
        if (nextLock) {
          ctx.window.setIgnoreMouseEvents(true, { forward: true });
          document.body.style.setProperty('-webkit-app-region', 'no-drag');
          await captureOffsetsFromPosition();
        } else {
          ctx.window.setIgnoreMouseEvents(false);
          document.body.style.setProperty('-webkit-app-region', 'drag');
        }
        // 持久化
        try {
          const saved = await ctx.storage.get("settings");
          await ctx.storage.set("settings", { ...(saved || {}), lockPosition: nextLock });
        } catch { /* 静默忽略 */ }
      };

      // ==================== SVG 矢量图标 ====================

      /** 锁图标 — Feather Icons 风格描边 SVG */
      const lockIcon = (open) => h("svg", {
        width: 16, height: 16, viewBox: "0 0 24 24",
        fill: "none", stroke: "currentColor",
        "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
      }, [
        h("rect", { x: 5, y: 11, width: 14, height: 10, rx: 2 }),
        h("path", {
          d: open
            ? "M8 11V7a4 4 0 0 1 7.8-1"
            : "M8 11V7a4 4 0 0 1 8 0v4",
        }),
      ]);

      /** 喜欢图标 — 实心/空心心形 SVG，喜欢时显示红色 */
      const heartIcon = (liked) => h("svg", {
        width: 16, height: 16, viewBox: "0 0 24 24",
        fill: liked ? "#ff2d55" : "none",
        stroke: liked ? "#ff2d55" : "currentColor",
        "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
      }, [
        h("path", {
          d: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
        }),
      ]);

      /** 不喜欢图标 — 心形带斜线（FM 模式用） */
      const dislikeIcon = () => h("svg", {
        width: 16, height: 16, viewBox: "0 0 24 24",
        fill: "none", stroke: "currentColor",
        "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
      }, [
        h("path", {
          d: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
        }),
        h("line", { x1: 1, y1: 1, x2: 23, y2: 23 }),
      ]);

      // ==================== 喜欢状态（来源：snapshot） ====================

      /** 喜欢状态直接从播放快照读取
       *  EchoMusic >= 2.2.6 起 snapshot.playback.isFavorite 由主进程维护 */
      const isLiked = computed(() => snapshot.value?.playback?.isFavorite ?? false);

      /** FM 模式检测 */
      const isPersonalFM = computed(() => snapshot.value?.playback?.isPersonalFM ?? false);

      /** 收藏切换（控件按钮调用）*/
      const toggleFavorite = () => {
        ctx.nowPlaying.command('toggleFavorite').catch(() => {});
      };

      /** FM 不喜欢：上报 garbage + 切下一首
       *  T1: ctx.player.dislikePersonalFm() — 完整流程（上报+跳过）
       *  T2: BroadcastChannel → index.js → ctx.player.dislikePersonalFm() — 跨上下文回退
       *  T3: IPC ctx.nowPlaying.command("nextTrack") — 仅跳过（不报 garbage） */
      const dislikeFm = async () => {
        // T1: 窗口直接调用 player API（如可用）
        if (ctx.player && typeof ctx.player.dislikePersonalFm === 'function') {
          try {
            await ctx.player.dislikePersonalFm();
            return;
          } catch (e) {
            // fall through
          }
        }
        // T2: 通过 BroadcastChannel 中转到 index.js
        try {
          channel?.postMessage({ type: "command", command: "dislikeFm" });
        } catch {}
        // T3: IPC 纯跳过（兜底，与 T2 并行）
        ctx.nowPlaying.command("nextTrack").catch(() => {});
      };

      /**
       * 渲染卡拉OK 效果的歌词文本
       * 对于非 YRC 歌词,使用整体渐变效果
       */
      const renderKaraokeText = (text, line, seekMs, isActive) => {
        if (!isActive || !line) return text;

        // 逐字歌词(YRC 格式)
        if (isYrcLine(line)) {
          const chars = line.characters || [];
          return chars.map((char, i) => {
            const duration = Math.max((char.endTime || 0) - (char.startTime || 0), 0.001);
            const progress = Math.max(Math.min((seekMs - (char.startTime || 0)) / duration, 1), 0);
            return h("span", {
              key: i,
              class: "tb-lyric-char",
              style: {
                backgroundImage: `linear-gradient(to right, ${settings.playedColor} 50%, ${settings.unplayedColor} 50%)`,
                backgroundPositionX: `${100 - progress * 100}%`,
              },
            }, char.text || "");
          });
        }

        // 非逐字歌词:整体渐变
        const lineStart = getLineStartMs(line);
        const chars = line.characters || [];
        let lineEnd;
        if (chars.length > 0) {
          lineEnd = chars[chars.length - 1]?.endTime ?? 0;
        } else {
          const nextIdx = currentIndex.value + 1;
          const lines = snapshot.value?.lyric?.lines ?? [];
          lineEnd = nextIdx < lines.length ? getLineStartMs(lines[nextIdx]) : lineStart + 5000;
        }
        const duration = Math.max(lineEnd - lineStart, 1);
        const progress = Math.max(0, Math.min(1, (seekMs - lineStart) / duration));

        return h("span", {
          class: "tb-lyric-char",
          style: {
            backgroundImage: `linear-gradient(to right, ${settings.playedColor} ${progress * 100}%, ${settings.unplayedColor} ${progress * 100}%)`,
          },
        }, text);
      };

      // ==================== 生命周期 ====================

      onMounted(async () => {
        // 1. 先建立 BroadcastChannel 监听(防止竞态)
        setupChannel();

        // 2. 获取当前播放快照
        snapshot.value = await ctx.nowPlaying.getSnapshot();
        snapshotDispose = ctx.nowPlaying.onSnapshot((next) => {
          snapshot.value = next;
          tickLyric();
        });

        // 3. 启动歌词刷新时钟
        clockTimer = setInterval(tickLyric, LYRIC_CLOCK_INTERVAL_MS);

        // 4. 从存储加载初始设置(仅作为 channel 尚未到达时的回退)
        if (!receivedFromChannel) {
          const saved = await ctx.storage.get("settings");
          if (saved && typeof saved === "object") {
            Object.assign(settings, saved);
          }
        }

        // 5. 定位窗口到任务栏上方
        positionToTaskbar(ctx, settings);

        // 6. 启动 storage 轮询(BroadcastChannel 后备方案 - 当跨进程 channel 不可用时,
        //    通过轮询 storage 来检测主插件的设置变更,确保浮窗始终同步最新配置)
        settingsSyncTimer = setInterval(async () => {
          if (receivedFromChannel) return; // channel 可用时退出轮询
          try {
            const saved = await ctx.storage.get("settings");
            if (!saved || typeof saved !== "object") return;
            // 用 hash 比较避免每次都对 reactive 对象执行 Object.assign
            const hash = JSON.stringify(saved);
            if (hash === lastSettingsHash) return;
            lastSettingsHash = hash;

            // ⚠️ 在 Object.assign 之前捕获窗口位置和宽/偏,防止多场景竞态
            const wasLocked = settings.lockPosition;
            const snapX = window.screenX;
            const snapY = window.screenY;
            const oldWidth = settings.windowWidth;
            const oldOffsetX = settings.taskbarOffsetX;

            Object.assign(settings, saved);

            // 如果是从未锁定→锁定,先用捕获的坐标反算偏移再重定位
            if (!wasLocked && settings.lockPosition && snapX !== undefined) {
              const base = computeWindowBounds({ ...settings, taskbarOffsetX: 0, taskbarOffsetY: 0, manualAdjust: true });
              const dx = snapX - base.x;
              const dy = snapY - base.y;
              const taskbar = base.taskbar;
              const pctX = Math.round((dx / Math.max((taskbar.screenWidth - base.width) / 2, 1)) * 100);
              const pctY = Math.round((dy / Math.max(taskbar.screenHeight / 4, taskbar.size * 3, 1)) * 100);
              settings.taskbarOffsetX = clamp(pctX, -100, 100);
              settings.taskbarOffsetY = clamp(pctY, -100, 100);
              ctx.storage.set("settings", { ...saved, taskbarOffsetX: settings.taskbarOffsetX, taskbarOffsetY: settings.taskbarOffsetY }).catch(() => {});
            }

            // 窗口宽度变化 → 以封面侧边缘为锚点保持对齐（利用 Electron 左边缘固定特性）
            if (settings.windowWidth !== oldWidth && settings.taskbarOffsetX === oldOffsetX) {
              const leftEdge = window.screenX; // Electron resize 保留左边缘,此处为旧值
              const isRightCover = settings.coverPosition === "right";
              const anchorEdge = isRightCover ? leftEdge + oldWidth : leftEdge;
              const targetX = isRightCover ? anchorEdge - settings.windowWidth : anchorEdge;
              const tb = detectTaskbarInfo();
              const centerX = Math.round((tb.screenWidth - settings.windowWidth) / 2);
              if (centerX > 0) {
                const pct = Math.round((targetX / centerX - 1) * 100);
                settings.taskbarOffsetX = clamp(pct, -100, 100);
                ctx.storage.set("settings", { ...saved, taskbarOffsetX: settings.taskbarOffsetX }).catch(() => {});
              }
            }

            // 主动触发位置重算(避免依赖 watch 在 channel 兜底时的时序问题)
            positionToTaskbar(ctx, settings);
          } catch { /* storage 轮询失败静默忽略 */ }
        }, 1000);

        // 7. 屏幕几何变化检测（解决掀盖唤醒/外接显示器/DPI 变化后浮窗漂移问题）
        let lastScreenKey = null;
        const checkScreenAndReposition = () => {
          const info = detectTaskbarInfo();
          const key = `${info.position}|${info.size}|${info.screenWidth}|${info.screenHeight}`;
          if (lastScreenKey !== key) {
            lastScreenKey = key;
            // 仅在锁定时重新定位；解锁时由用户自由拖拽
            if (settings.lockPosition) positionToTaskbar(ctx, settings);
          }
        };
        // 首次记录当前屏幕几何
        checkScreenAndReposition();

        // 8. 窗口心跳：每 2s 通过 BroadcastChannel 发心跳到主插件
        //    （置顶使用一次性的 screen-saver 级别，无需周期性重设）
        let keepaliveTimer = setInterval(() => {
          channel?.postMessage({ type: "heartbeat", ts: Date.now() });
          checkScreenAndReposition();
        }, 2000);
        // 立即发送首次心跳
        channel?.postMessage({ type: "heartbeat", ts: Date.now() });

        // 9. resize 事件快速响应（显示器连接/断开、DPI 变化）
        const onScreenResize = () => { checkScreenAndReposition(); };
        window.addEventListener('resize', onScreenResize);

        // 9b. 悬停离开兜底：document mouseleave 确保鼠标离开 Electron 窗口时可靠触发
        document.addEventListener('mouseleave', onDocMouseLeave);

        // 9c. 一次性 mousemove 快照：挂载后 600ms 内检测鼠标是否已在窗口上方
        let initHoverSnapshot = null;
        let initHoverTimer = setTimeout(() => {
          document.removeEventListener('mousemove', initHoverSnapshot);
          initHoverSnapshot = null;
        }, 600);
        initHoverSnapshot = () => {
          if (leaveDebounce) return;
          isHoverModeActive = true;
          document.addEventListener('mousemove', onWatchDogMove);
          cancelHoverTimer();
          isHovered.value = true;
          hoverModeTimer = setTimeout(() => {
            hoverModeTimer = null;
            if (isHovered.value && !leaveDebounce) {
              ctx.window.setIgnoreMouseEvents(false);
              armWatchDog();
            }
          }, 80);
          clearTimeout(initHoverTimer);
          document.removeEventListener('mousemove', initHoverSnapshot);
          initHoverSnapshot = null;
        };
        document.addEventListener('mousemove', initHoverSnapshot);

        // 10. 桌面歌词级置顶：screen-saver 级别一次设好，无需周期性重设
        ctx.window.setAlwaysOnTop(true, 'screen-saver');

        // 11. 根据锁定状态设置鼠标穿透与拖拽(默认锁定 = 透传 mousemove 用于检测悬停)
        if (settings.lockPosition) {
          ctx.window.setIgnoreMouseEvents(true, { forward: true });
          document.body.style.setProperty('-webkit-app-region', 'no-drag');
        } else {
          ctx.window.setIgnoreMouseEvents(false);
          document.body.style.setProperty('-webkit-app-region', 'drag');
        }

        // 12. 淡入显示窗口
        requestAnimationFrame(() => {
          document.documentElement.classList.add("tb-lyric-visible");
          // 首屏溢出检测(等待字体加载完成后再测一次更精确)
          checkOverflow();
        });
      });

      /**
       * 捕获当前窗口位置,反算偏移值并持久化
       * 在用户拖拽后锁定时调用,使拖拽位置成为新的「默认」位置
       */
      const captureOffsetsFromPosition = async () => {
        try {
          const wx = window.screenX;
          const wy = window.screenY;
          if (wx === undefined || wy === undefined) return;
          // 以零偏移为基准,计算当前窗口距基准的像素差
          const base = computeWindowBounds({ ...settings, taskbarOffsetX: 0, taskbarOffsetY: 0, manualAdjust: true });
          const dx = wx - base.x;
          const dy = wy - base.y;
          const taskbar = base.taskbar;
          // 像素差 → 百分比偏移
          const pctX = Math.round((dx / Math.max((taskbar.screenWidth - base.width) / 2, 1)) * 100);
          const pctY = Math.round((dy / Math.max(taskbar.screenHeight / 4, taskbar.size * 3, 1)) * 100);
          const newOx = clamp(pctX, -100, 100);
          const newOy = clamp(pctY, -100, 100);
          // computeWindowBounds 现在始终应用偏移,无需强制开启 manualAdjust
          settings.taskbarOffsetX = newOx;
          settings.taskbarOffsetY = newOy;
          // 持久化到 storage(只存偏移,不改 manualAdjust)
          const saved = await ctx.storage.get("settings");
          await ctx.storage.set("settings", { ...(saved || {}), taskbarOffsetX: newOx, taskbarOffsetY: newOy });
        } catch { /* 静默忽略 */ }
      };

      onBeforeUnmount(() => {
        stopWatchPosition?.();
        stopWatchLock?.();
        stopWatchOverflow?.();

        window.removeEventListener('resize', onScreenResize);
        document.removeEventListener('mouseleave', onDocMouseLeave);
        if (initHoverSnapshot) { document.removeEventListener('mousemove', initHoverSnapshot); clearTimeout(initHoverTimer); }
        if (hoverModeTimer) clearTimeout(hoverModeTimer);
        if (leaveDebounce) clearTimeout(leaveDebounce);
        disarmWatchDog();
        document.removeEventListener('mousemove', onWatchDogMove);
        snapshotDispose?.();
        if (clockTimer) clearInterval(clockTimer);
        if (settingsSyncTimer) clearInterval(settingsSyncTimer);
        if (keepaliveTimer) clearInterval(keepaliveTimer);
        channel?.close();
      });

      // 监听窗口尺寸 + 偏移 + 手动调整 变化,重新定位(不含 lockPosition!)
      const stopWatchPosition = watch(
        () => [settings.windowWidth, settings.windowHeight, settings.taskbarOffsetX, settings.taskbarOffsetY, settings.manualAdjust],
        () => {
          positionToTaskbar(ctx, settings);
        },
      );

      // 监听锁定状态变化
      // 锁定时用 { forward: true } 保持 mousemove 接收,供悬停检测使用
      const stopWatchLock = watch(
        () => settings.lockPosition,
        (lock) => {
          if (lock) {
            ctx.window.setIgnoreMouseEvents(true, { forward: true });
            document.body.style.setProperty('-webkit-app-region', 'no-drag');
          } else {
            ctx.window.setIgnoreMouseEvents(false);
            document.body.style.setProperty('-webkit-app-region', 'drag');
          }
          if (lock) {
            captureOffsetsFromPosition();
          }
        },
      );

      // 监听歌词文本或窗口宽度变化 → 检测溢出并启动/停止滚动动画
      const stopWatchOverflow = watch(
        () => [currentText.value, secondaryText.value, settings.windowWidth],
        async () => {
          await nextTick();
          checkOverflow();
        },
      );

      // ==================== 渲染 ====================

      return () => {
        const showCover = settings.showCover && coverUrl.value;
        const coverOnLeft = settings.coverPosition === "left";
        const fontFamilyStyle = settings.fontFamily || undefined;
        const snap = snapshot.value;
        const seekMs = getLyricSeekMs(snap || {});
        const textAlign = coverOnLeft ? "left" : "right";
        const isPlaying = snap?.playback?.isPlaying;
        const liked = isLiked.value;

        const primaryStyle = {
          fontSize: `${settings.lyricFontSize}px`,
          fontFamily: fontFamilyStyle,
          color: settings.playedColor,
          textAlign,
        };

        const secondaryStyle = {
          fontSize: `${settings.secondaryFontSize}px`,
          fontFamily: fontFamilyStyle,
          color: settings.unplayedColor,
          textAlign,
        };

        // 封面元素
        const coverElement = showCover
          ? h("div", {
              class: ["tb-lyric-cover", settings.coverShape],
              style: {
                width: `${settings.coverSize}px`,
                height: `${settings.coverSize}px`,
              },
            }, [
              h("img", { src: coverUrl.value, alt: "", draggable: "false" }),
            ])
          : null;

        // 主歌词(卡拉OK着色,包在滚动容器内)
        const primaryContent = renderKaraokeText(
          currentText.value, currentLine.value, seekMs, true,
        );

        // 歌词文本容器
        const textElement = h("div", { class: "tb-lyric-text", style: { textAlign } }, [
          h("div", {
            class: ["tb-lyric-primary", primaryOverflow.value ? "tb-lyric-overflow" : ""],
            style: primaryStyle,
          }, [
            h("div", {
              class: "tb-lyric-scroll",
              ref: (el) => { primaryScrollEl = el; },
            }, Array.isArray(primaryContent) ? primaryContent : [primaryContent]),
          ]),
          secondaryText.value
            ? h("div", {
                class: ["tb-lyric-secondary", secondaryOverflow.value ? "tb-lyric-overflow" : ""],
                style: secondaryStyle,
              }, [
                h("div", {
                  class: "tb-lyric-scroll",
                  ref: (el) => { secondaryScrollEl = el; },
                }, secondaryText.value),
              ])
            : null,
        ]);

        // 悬停控件栏 — FM 模式：不喜欢 + 暂停 + 下一首 + 喜欢 + 锁定
        //                 普通模式：上一首 + 暂停 + 下一首 + 喜欢 + 锁定
        const controlsElement = h("div", { class: "tb-lyric-controls" }, [
          isPersonalFM.value
            ? h("button", {
                class: ["tb-lyric-btn", "tb-lyric-btn-icon"],
                title: "不喜欢",
                onClick: (e) => { e.stopPropagation(); dislikeFm(); },
              }, dislikeIcon())
            : h("button", {
                class: "tb-lyric-btn",
                title: "上一首",
                onClick: (e) => { e.stopPropagation(); ctx.nowPlaying.command("previousTrack").catch(() => {}); },
              }, "\u23EE"),
          h("button", {
            class: ["tb-lyric-btn", "tb-lyric-btn-play"],
            title: isPlaying ? "暂停" : "播放",
            onClick: (e) => { e.stopPropagation(); ctx.nowPlaying.command("togglePlayback").catch(() => {}); },
          }, isPlaying ? "\u23F8" : "\u25B6"),
          h("button", {
            class: "tb-lyric-btn",
            title: "下一首",
            onClick: (e) => { e.stopPropagation(); ctx.nowPlaying.command("nextTrack").catch(() => {}); },
          }, "\u23ED"),
          h("button", {
            class: ["tb-lyric-btn", "tb-lyric-btn-icon"],
            title: liked ? "取消喜欢" : "喜欢",
            onClick: (e) => { e.stopPropagation(); toggleFavorite(); },
          }, heartIcon(liked)),
          h("button", {
            class: ["tb-lyric-btn", "tb-lyric-btn-icon"],
            title: settings.lockPosition ? "解锁" : "锁定",
            onClick: (e) => { e.stopPropagation(); toggleLock(); },
          }, lockIcon(!settings.lockPosition)),
        ]);

        const children = coverOnLeft
          ? [coverElement, textElement, controlsElement]
          : [textElement, coverElement, controlsElement];

        return h("div", {
          class: ["tb-lyric-root", showCover ? "has-cover" : "", isHovered.value ? "tb-lyric-hover" : ""],
          onMouseenter: onMouseEnter,
          onMouseleave: onRootMouseLeave,
        }, children);
      };
    },
  };

  const app = createApp(App);
  app.mount(ctx.container);
  ctx.dispose(() => app.unmount());
}
