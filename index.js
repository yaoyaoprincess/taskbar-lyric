/**
 * 任务栏歌词插?- 主入? * 管理设置面板、窗口生命周期、BroadcastChannel 设置同步
 * 
 * 共享常量与工具函数的权威文档定义?./shared.js 中，本文件内联了一份副本? * 修改常量时请同步更新 shared.js ?taskbar-lyric-window.js 两处? */

// ==================== 内联常量（与 shared.js 保持同步?====================

/** 存储键名，用于持久化设置 */
const STORAGE_KEY = "settings";

/** BroadcastChannel 频道名称，用于向浮窗同步设置 */
const CHANNEL_NAME = "echo-plugin:taskbar-lyric:settings";

/** 浮窗窗口 ID，用于窗口管?API */
const WINDOW_ID = "taskbar-lyric";

/** 默认设置对象（与 shared.js DEFAULT_SETTINGS 同步?*/
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

// ==================== 工具函数（与 shared.js 保持同步?====================

/**
 * 数值钳制函? */
const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));

/**
 * 归一化设置对? * 确保所有设置项都有有效的默认值，且值在合法范围? */
const normalizeSettings = (value) => {
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

// ==================== 字体扫描 ====================

/**
 * 获取系统字体列表
 * EchoMusic 内置 ctx.fonts API，无需手动解析 TTF/OTF。
 *
 * @param {Object} ctx - 插件上下文
 * @returns {Promise<string[]>} 字体名称数组
 */
// 模块级状态
let state = null;              // 插件状态（包含设置）
let channel = null;            // BroadcastChannel 实例
let lastWindowHeartbeat = 0;   // 最后收到浮窗心跳时间戳
let heartbeatMissCount = 0;    // 连续丢失心跳计数
let settingsDispose = null;    // 设置面板清理函数
let windowRecoveryTimer = null; // 心跳恢复定时器（30s 检测窗口存活）
let applyingRemoteSettings = false; // 防止设置同步循环

/**
 * 通过 BroadcastChannel 广播设置到浮? * 窗口的实际位置由浮窗端根据任务栏检测自动计算，主入口不需要处理定位? */
const broadcastSettings = () => {
  if (!channel || applyingRemoteSettings || !state) return;
  try {
    channel.postMessage({
      type: "settings",
      settings: normalizeSettings({ ...state.settings }),
    });
  } catch (error) {
    console.warn("[taskbar-lyric] 同步设置失败", error);
  }
};

/**
 * 应用设置并广播到浮窗
 * @param {Object} ctx - 插件上下? * @param {Object} values - 新设置? * @param {Object} options - 选项（broadcast: 是否广播? */
const applySettings = async (ctx, values, options = {}) => {
  if (!state) return;
  state.settings = normalizeSettings(values);
  if (options.broadcast !== false) broadcastSettings();
};

/**
 * 设置 BroadcastChannel 监听
 * 接收来自主插件的设置更新
 * @param {Object} ctx - 插件上下? */
const setupSettingsChannel = (ctx) => {
  if (typeof BroadcastChannel !== "function") return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const payload = event.data;
    if (!payload) return;
    if (payload.type === "heartbeat") {
      lastWindowHeartbeat = payload.ts;
      heartbeatMissCount = 0; // 心跳恢复，重置丢失计数
      return;
    }
    if (payload.type === "settings") {
      applyingRemoteSettings = true;
      void applySettings(ctx, payload.settings, { broadcast: false }).finally(
        () => { applyingRemoteSettings = false; },
      );
      return;
    }
    if (payload.type === "command") {
      if (payload.command === "dislikeFm" && ctx.player?.dislikePersonalFm) {
        ctx.player.dislikePersonalFm().catch((e) => {
          console.warn("[taskbar-lyric] dislikeFm via channel failed:", e);
        });
      }
      return;
    }
  };
};

/**
 * 创建预览组件
 * 在设置面板中显示歌词效果预览
 * @param {Object} ctx - 插件上下? * @returns {Object} Vue 组件
 */
const createPreviewComponent = (ctx) =>
  ctx.vue.defineComponent({
    name: "TaskbarLyricPreview",
    props: {
      settings: { type: Object, required: true },
    },
    setup(props) {
      const { h, computed } = ctx.vue;

      // 预览文本
      const previewText = computed(() => {
        if (!props.settings.enabled) return "任务栏歌词已停用";
        return props.settings.emptyText || "正在播放的歌词会显示在这里";
      });

      // 副文本预览
      const secondaryPreview = computed(() => {
        if (!props.settings.enabled) return "";
        if (!props.settings.doubleLine) return "";
        return props.settings.showTranslation ? "Translation text" : "下一行歌词";
      });

      return () => {
        const showCover = props.settings.showCover;
        const coverOnLeft = props.settings.coverPosition === "left";
        const fontFamilyStyle = props.settings.fontFamily || undefined;
        const isEnabled = props.settings.enabled;

        // 封面尺寸（预览最?36px?
        const previewCoverSize = Math.min(props.settings.coverSize, 36);
        // 主歌词字号（预览最?20px?
        const previewFontSize = Math.min(props.settings.lyricFontSize, 20);
        // 副歌词字号（预览最?16px?
        const previewSecFontSize = Math.min(props.settings.secondaryFontSize, 16);

        // 主歌词样式（卡拉OK渐变模拟：~55% 已播放）
        const primaryStyle = isEnabled ? {
          fontSize: `${previewFontSize}px`,
          fontFamily: fontFamilyStyle,
          backgroundImage: `linear-gradient(to right, ${props.settings.playedColor} 55%, ${props.settings.unplayedColor} 55%)`,
          filter: `drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))`,
        } : {
          fontSize: `${previewFontSize}px`,
          fontFamily: fontFamilyStyle,
          color: props.settings.unplayedColor,
          fontWeight: 600,
        };

        // 封面元素（渐变背景 + 音符图标）
        const coverElement = showCover
          ? h("div", {
              class: ["tb-lyric-preview-cover", props.settings.coverShape],
              style: {
                width: `${previewCoverSize}px`,
                height: `${previewCoverSize}px`,
                background: `linear-gradient(135deg, ${props.settings.playedColor}66, ${props.settings.unplayedColor}44)`,
                border: isEnabled ? `1px solid ${props.settings.playedColor}44` : "1px solid rgba(255,255,255,0.08)",
              },
            }, [
              h("svg", {
                viewBox: "0 0 24 24",
                width: `${Math.max(previewCoverSize * 0.5, 12)}px`,
                height: `${Math.max(previewCoverSize * 0.5, 12)}px`,
                fill: isEnabled ? props.settings.playedColor : "rgba(255,255,255,0.3)",
                style: { opacity: 0.85, pointerEvents: "none" },
              }, [
                h("path", { d: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" })
              ])
            ])
          : null;

        // 歌词文本元素（封面在右时右对齐）
        const coverOnRight = props.settings.coverPosition === "right";
        const textElement = h("div", {
          class: "tb-lyric-preview-text",
          style: coverOnRight ? { textAlign: "right", alignItems: "flex-end" } : undefined,
        }, [
          h("div", {
            class: ["tb-lyric-preview-primary", isEnabled ? "karaoke" : ""],
            style: primaryStyle,
          }, previewText.value),
          secondaryPreview.value
            ? h("div", {
                class: "tb-lyric-preview-secondary",
                style: {
                  fontSize: `${previewSecFontSize}px`,
                  color: props.settings.unplayedColor,
                  fontFamily: fontFamilyStyle,
                  opacity: 0.7,
                },
              }, secondaryPreview.value)
            : null,
        ]);

        // 子元素统一 [coverElement, textElement]
        // 右侧布局?CSS cover-right ?flex-direction: row-reverse 翻转
        const children = [coverElement, textElement];

        // 预览宽度跟随设置，上限避免溢?
        const previewWidth = Math.min(Math.max(props.settings.windowWidth, 200), 520);

        return h("div", { class: "tb-lyric-preview" }, [
          h("div", { class: "tb-lyric-preview-label" }, "预览效果"),
          h("div", {
            class: [
              "tb-lyric-preview-box",
              { "has-cover": showCover },
              `cover-${props.settings.coverPosition}`,
            ],
            style: { width: `${previewWidth}px`, maxWidth: "100%" },
          }, children),
        ]);
      };
    },
  });

/**
 * 创建设置面板组件
 * @param {Object} ctx - 插件上下? * @returns {Object} Vue 组件
 */
const createSettingsComponent = (ctx) =>
  ctx.vue.defineComponent({
    name: "TaskbarLyricSettings",
    setup() {
      const { h, reactive, ref, watch, onMounted, onBeforeUnmount, defineAsyncComponent } = ctx.vue;
      // 异步加载 UI 组件
      const Button = defineAsyncComponent(ctx.ui.components.Button);
      const Input = defineAsyncComponent(ctx.ui.components.Input);
      const Slider = defineAsyncComponent(ctx.ui.components.Slider);
      const Switch = defineAsyncComponent(ctx.ui.components.Switch);
      const Preview = createPreviewComponent(ctx);
      // 草稿设置（未保存的修改）
      const draft = reactive(normalizeSettings(state?.settings));
      const saving = ref(false);
      const message = ref("");
      const fonts = ref([]);
      // 监听设置变化，同步到草稿
      watch(
        () => state?.settings,
        (settings) => {
          if (settings && !saving.value) {
            Object.assign(draft, normalizeSettings(settings));
          }
        },
        { deep: true },
      );

      // 组件挂载时加载字体、同步 storage 中的设置
      onMounted(async () => {
        try {
          const all = await ctx.fonts.getAll();
          const list = Array.isArray(all) ? [...all].sort((a, b) => a.localeCompare(b, "zh")) : [];
          if (list.length > 0) fonts.value = list;
          const stored = await ctx.storage.get(STORAGE_KEY);
          if (stored && typeof stored === "object") {
            Object.assign(draft, normalizeSettings(stored));
          }
        } catch { /* 静默忽略 */ }
      });

      // 设置草稿值
      const setDraftValue = (key, value) => {
        draft[key] = value;
        message.value = "";
      };

      // 保存设置
      const saveDraft = async () => {
        if (saving.value) return;
        saving.value = true;
        try {
          const next = normalizeSettings({ ...draft });
          await ctx.storage.set(STORAGE_KEY, next);
          await applySettings(ctx, next);
          Object.assign(draft, next);
          message.value = "设置已保存";
          ctx.toast.success("任务栏歌词设置已保存");
        } catch (error) {
          const text = error instanceof Error ? error.message : "设置保存失败";
          message.value = text;
          ctx.toast.warning(text);
        } finally {
          saving.value = false;
        }
      };

      // 字体下拉框展开状态
      const showFontDropdown = ref(false);
      const fontDropdownRef = ref(null);
      const toggleFontDropdown = () => { showFontDropdown.value = !showFontDropdown.value; };
      const selectFont = (font) => { setDraftValue("fontFamily", font); showFontDropdown.value = false; };
      // 点击外部关闭下拉框
      const onFontClickOutside = (e) => {
        if (fontDropdownRef.value && !fontDropdownRef.value.contains(e.target)) {
          showFontDropdown.value = false;
        }
      };
      onMounted(() => {
        document.addEventListener("click", onFontClickOutside, true);
      });
      onBeforeUnmount(() => {
        document.removeEventListener("click", onFontClickOutside, true);
      });

      // 渲染字体选择器
      const renderFontSelector = () =>
        h("div", { class: "tb-lyric-settings-font-section" }, [
          h("label", { class: "tb-lyric-settings-field" }, [
            h("span", { class: "tb-lyric-settings-label" }, "字体名称"),
            h("div", { class: "tb-lyric-settings-font-dropdown", ref: fontDropdownRef }, [
              h("button", {
                class: "tb-lyric-settings-select-trigger",
                onClick: toggleFontDropdown,
                type: "button",
              }, draft.fontFamily || "系统默认"),
              showFontDropdown.value ? h("div", { class: "tb-lyric-settings-select-dropdown" }, [
                h("div", {
                  class: ["tb-lyric-settings-select-option", !draft.fontFamily ? "active" : ""],
                  onClick: () => selectFont(""),
                }, "系统默认"),
                ...fonts.value.map((font) =>
                  h("div", {
                    class: ["tb-lyric-settings-select-option", draft.fontFamily === font ? "active" : ""],
                    style: { fontFamily: font },
                    onClick: () => selectFont(font),
                  }, font)
                ),
              ]) : null,
            ]),
          ]),
        ]);

      // 恢复默认设置
      const resetDraft = () => {
        Object.assign(draft, normalizeSettings(DEFAULT_SETTINGS));
        message.value = "已恢复默认，保存后生效";
      };

      // 渲染开关行
      const renderSwitchRow = (key, label, hint = "", options = {}) =>
        h("div", { class: ["tb-lyric-settings-row", options.primary ? "is-primary" : ""] }, [
          h("div", { class: "tb-lyric-settings-copy" }, [
            h("span", label),
            hint ? h("small", hint) : null,
          ]),
          h(Switch, {
            modelValue: Boolean(draft[key]),
            "onUpdate:modelValue": (value) => setDraftValue(key, Boolean(value)),
          }),
        ]);

      // 渲染设置分区
      const renderSection = (title, description, children) =>
        h("section", { class: "tb-lyric-settings-section" }, [
          h("div", { class: "tb-lyric-settings-section-heading" }, [
            h("div", { class: "tb-lyric-settings-section-copy" }, [
              h("h3", title),
              description ? h("small", description) : null,
            ]),
          ]),
          ...children,
        ]);

      // 渲染滑块字段
      const renderSliderField = (key, label, options) =>
        h("label", { class: "tb-lyric-settings-field" }, [
          h("span", { class: "tb-lyric-settings-label" }, label),
          h(Slider, {
            modelValue: Number(draft[key]),
            min: options.min,
            max: options.max,
            step: options.step ?? 1,
            showValue: true,
            valueSuffix: options.suffix ?? "",
            class: "tb-lyric-settings-slider",
            "onUpdate:modelValue": (value) => setDraftValue(key, Number(value)),
          }),
        ]);

      // 渲染文本输入字段
      const renderInputField = (key, label, placeholder = "") =>
        h("label", { class: "tb-lyric-settings-field" }, [
          h("span", { class: "tb-lyric-settings-label" }, label),
          h(Input, {
            modelValue: draft[key],
            placeholder,
            class: "tb-lyric-settings-input",
            "onUpdate:modelValue": (value) => setDraftValue(key, String(value ?? "")),
          }),
        ]);

      // 渲染颜色选择字段
      const renderColorField = (key, label) =>
        h("label", { class: "tb-lyric-settings-field" }, [
          h("span", { class: "tb-lyric-settings-label" }, label),
          h("div", { class: "tb-lyric-settings-color-row" }, [
            h("input", {
              type: "color",
              value: draft[key],
              onInput: (e) => setDraftValue(key, e.target.value),
            }),
            h(Input, {
              modelValue: draft[key],
              class: "tb-lyric-settings-input tb-lyric-settings-color-input",
              "onUpdate:modelValue": (value) => setDraftValue(key, String(value ?? "")),
            }),
          ]),
        ]);

      // 渲染单选按钮组
      const renderRadioGroup = (key, options) =>
        h("div", { class: "tb-lyric-settings-radio-group" }, options.map((opt) =>
          h("button", {
            class: ["tb-lyric-settings-radio-btn", draft[key] === opt.value ? "active" : ""],
            onClick: () => setDraftValue(key, opt.value),
          }, opt.label)
        ));

      // 渲染按钮
      const renderButton = (label, props = {}) =>
        h(Button, props, { default: () => label });

      return () =>
        h("div", { class: "tb-lyric-settings" }, [
          // 预览区域
          h(Preview, { settings: { ...draft } }),
          // 启用设置
          renderSection("启用", "控制任务栏歌词浮窗的显示", [
            renderSwitchRow("enabled", "启用任务栏歌词", "", { primary: true }),
          ]),
          // 歌词内容设置
          renderSection("歌词内容", "控制歌词和副文本的展示", [
            renderSwitchRow("doubleLine", "双行显示", "开启时显示两行歌词，关闭时只显示一行"),
            renderSwitchRow("showTranslation", "显示翻译", "当歌词有翻译且开启时显示"),
            renderSwitchRow("showRomanization", "显示音译", "当歌词有音译且开启时显示"),
            renderSwitchRow("secondaryScroll", "副歌词跑马灯", "副歌词过长时启用滚动效果"),
            renderInputField("emptyText", "无歌词文本", "留空则隐藏"),
          ]),
          // 过滤设置
          renderSection("过滤", "用正则式忽略歌词行（制作信息、版权信息等）", [
            renderSwitchRow("lyricFilterEnabled", "启用歌词过滤", "开启后隐藏匹配正则的歌词行"),
            draft.lyricFilterEnabled
              ? renderInputField("lyricFilterPatterns", "过滤正则式", "例：作词|作曲|编曲")
              : null,
          ]),
          // 封面设置
          renderSection("封面", "控制专辑封面的显示和位置", [
            renderSwitchRow("showCover", "显示封面"),
            renderSliderField("coverSize", "封面大小", { min: 24, max: 64, suffix: "px" }),
            h("label", { class: "tb-lyric-settings-field" }, [
              h("span", { class: "tb-lyric-settings-label" }, "封面形状"),
              renderRadioGroup("coverShape", [
                { label: "圆形", value: "round" },
                { label: "方形", value: "square" },
              ]),
            ]),
            h("label", { class: "tb-lyric-settings-field" }, [
              h("span", { class: "tb-lyric-settings-label" }, "封面位置"),
              renderRadioGroup("coverPosition", [
                { label: "左侧", value: "left" },
                { label: "右侧", value: "right" },
              ]),
            ]),
          ]),
          // 外观设置
          renderSection("外观", "调整字体、颜色", [
            renderSliderField("lyricFontSize", "主歌词字号", { min: 10, max: 24, suffix: "px" }),
            renderSliderField("secondaryFontSize", "副歌词字号", { min: 10, max: 18, suffix: "px" }),
            renderFontSelector(),
            renderColorField("playedColor", "已播放颜色"),
            renderColorField("unplayedColor", "未播放颜色"),
          ]),
          // 窗口设置
          renderSection("窗口", "窗口自动贴靠任务栏。拖动百分比偏移手动调整位置（自动适配屏幕分辨率）", [
            renderSwitchRow("lockPosition", "锁定窗口位置", "开启时鼠标穿透、不可拖动。关闭后可拖拽调整位置"),
            renderSwitchRow("manualAdjust", "手动调整", "勾选后可通过下方偏移滑块微调浮窗位置"),
            renderSliderField("windowWidth", "窗口宽度", { min: 200, max: 600, suffix: "px" }),
            renderSliderField("windowHeight", "窗口高度", { min: 24, max: 80, suffix: "px" }),
            h("label", { class: "tb-lyric-settings-field" }, [
              h("span", { class: "tb-lyric-settings-label" }, draft.manualAdjust ? "水平偏移" : "水平偏移（需先勾选手动调整）"),
              h(Slider, {
                modelValue: Number(draft.taskbarOffsetX),
                min: -100, max: 100, step: 1,
                showValue: true,
                valueSuffix: "%",
                disabled: !draft.manualAdjust,
                class: "tb-lyric-settings-slider",
                "onUpdate:modelValue": (value) => setDraftValue("taskbarOffsetX", Number(value)),
              }),
            ]),
            h("label", { class: "tb-lyric-settings-field" }, [
              h("span", { class: "tb-lyric-settings-label" }, draft.manualAdjust ? "垂直偏移" : "垂直偏移（需先勾选手动调整）"),
              h(Slider, {
                modelValue: Number(draft.taskbarOffsetY),
                min: -100, max: 100, step: 1,
                showValue: true,
                valueSuffix: "%",
                disabled: !draft.manualAdjust,
                class: "tb-lyric-settings-slider",
                "onUpdate:modelValue": (value) => setDraftValue("taskbarOffsetY", Number(value)),
              }),
            ]),
          ]),
          // 底部按钮
          h("div", { class: "tb-lyric-settings-footer" }, [
            renderButton("恢复默认", {
              variant: "ghost",
              size: "xs",
              disabled: saving.value,
              onClick: resetDraft,
            }),
            renderButton(saving.value ? "保存中..." : "保存", {
              variant: "primary",
              size: "xs",
              loading: saving.value,
              disabled: saving.value,
              onClick: saveDraft,
            }),
            message.value ? h("span", { class: "tb-lyric-settings-message" }, message.value) : null,
          ]),
        ]);
    },
  });

/**
 * 注册设置面板
 * @param {Object} ctx - 插件上下? */
const registerSettings = (ctx) => {
  settingsDispose?.();
  settingsDispose = ctx.ui.settings.define({
    title: "任务栏歌词",
    description: "在任务栏上方显示当前歌词和专辑封面的透明浮窗",
    component: createSettingsComponent(ctx),
  });
};

// ==================== 窗口生命周期 ====================

/** 显示浮窗 */
const showWindow = (ctx) => {
  ctx.windows.show(WINDOW_ID, {
    alwaysOnTop: true,
    width: state.settings.windowWidth,
    height: state.settings.windowHeight,
  });
};

/** 轻量恢复浮窗（不改变尺寸，仅重新声明置顶和显示） */
const recoverWindow = (ctx) => {
  ctx.windows.show(WINDOW_ID, { alwaysOnTop: true });
};

/** 隐藏浮窗 */
const hideWindow = (ctx) => {
  ctx.windows.hide(WINDOW_ID);
};

/**
 * 插件激活入? * @param {Object} ctx - 插件上下? */
export async function activate(ctx) {
  // 初始化状态，加载已保存的设置
  state = ctx.vue.reactive({
    settings: normalizeSettings(await ctx.storage.get(STORAGE_KEY)),
  });

  // 设置设置同步通道
  setupSettingsChannel(ctx);
  // 注册设置面板
  registerSettings(ctx);
  // 注入设置面板样式
  ctx.css.inject(
    `
/* 设置面板根容?*/
.tb-lyric-settings {
  display: grid;
  gap: 14px;
  color: var(--color-text-main, var(--text-main, #f8fafc));
}

/* 设置分区 */
.tb-lyric-settings-section {
  display: grid;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 12%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-elevated-base, #111827) 72%, transparent);
  padding: 14px;
}

/* 分区标题 */
.tb-lyric-settings-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.tb-lyric-settings-section-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 760;
}

.tb-lyric-settings-section-copy {
  display: grid;
  gap: 3px;
}

.tb-lyric-settings-section-copy small,
.tb-lyric-settings-copy small {
  color: var(--color-text-secondary, var(--text-secondary, rgba(148, 163, 184, 0.9)));
  font-size: 12px;
  line-height: 1.45;
}

/* 设置?*/
.tb-lyric-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.tb-lyric-settings-row.is-primary {
  border-bottom: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 10%, transparent);
  padding-bottom: 10px;
}

.tb-lyric-settings-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.tb-lyric-settings-copy span,
.tb-lyric-settings-label {
  font-size: 13px;
  font-weight: 650;
}

/* 设置字段 */
.tb-lyric-settings-field {
  display: grid;
  gap: 8px;
}

.tb-lyric-settings-input input {
  height: 36px;
  border-radius: 8px;
  padding-left: 12px;
  padding-right: 32px;
  font-size: 13px;
}

.tb-lyric-settings-slider {
  width: 100%;
  min-width: 0;
}

/* 单选按钮组 */
.tb-lyric-settings-radio-group {
  display: flex;
  gap: 8px;
}

.tb-lyric-settings-radio-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 20%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, var(--text-secondary, rgba(148, 163, 184, 0.9)));
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tb-lyric-settings-radio-btn:hover {
  background: color-mix(in srgb, var(--color-text-main, #f8fafc) 8%, transparent);
}

.tb-lyric-settings-radio-btn.active {
  background: color-mix(in srgb, var(--color-primary, #31cfa1) 16%, transparent);
  color: var(--color-primary, #31cfa1);
  border-color: var(--color-primary, #31cfa1);
}

/* 颜色选择?*/
.tb-lyric-settings-color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tb-lyric-settings-color-row input[type="color"] {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
}

.tb-lyric-settings-color-input {
  flex: 1;
}

/* 底部按钮 */
.tb-lyric-settings-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding-top: 2px;
}

.tb-lyric-settings-message {
  color: var(--color-text-secondary, var(--text-secondary, rgba(148, 163, 184, 0.9)));
  font-size: 12px;
}

/* 预览区域 */
.tb-lyric-preview {
  display: grid;
  gap: 8px;
}

.tb-lyric-preview-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--text-secondary, rgba(148, 163, 184, 0.9)));
}

.tb-lyric-preview-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: transparent;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 10%, transparent);
  min-height: 50px;
  position: relative;
  overflow: hidden;
}

/* 透明遮罩层（保留结构，视觉透明?*/
.tb-lyric-preview-box::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: transparent;
  pointer-events: none;
}

.tb-lyric-preview-box.has-cover {
  padding: 10px 14px 10px 8px;
}

.tb-lyric-preview-box.cover-right {
  flex-direction: row-reverse;
}

.tb-lyric-preview-box.cover-right.has-cover {
  padding: 10px 8px 10px 14px;
}

.tb-lyric-preview-cover {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tb-lyric-preview-cover.round {
  border-radius: 50%;
}

.tb-lyric-preview-cover.square {
  border-radius: 4px;
}

.tb-lyric-preview-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
  z-index: 1;
}

.tb-lyric-preview-primary {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  font-weight: 600;
}

/* 卡拉OK渐变文字（主歌词?*/
.tb-lyric-preview-primary.karaoke {
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.tb-lyric-preview-secondary {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 400;
  line-height: 1.3;
}

/* 字体选择器 */
.tb-lyric-settings-font-section {
  display: grid;
  gap: 10px;
}

.tb-lyric-settings-font-dropdown {
  position: relative;
  width: 100%;
}

.tb-lyric-settings-select-trigger {
  width: 100%;
  height: 36px;
  padding: 0 36px 0 12px;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 14%, transparent);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-main, var(--text-main, #f8fafc));
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  outline: none;
  transition: border-color 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.tb-lyric-settings-select-trigger:hover {
  border-color: color-mix(in srgb, var(--color-text-main, #f8fafc) 28%, transparent);
}

.tb-lyric-settings-select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 14%, transparent);
  border-radius: 8px;
  background: var(--surface-elevated-base, #111827);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.tb-lyric-settings-select-dropdown::-webkit-scrollbar {
  width: 4px;
}

.tb-lyric-settings-select-dropdown::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-text-main, #f8fafc) 20%, transparent);
  border-radius: 2px;
}

.tb-lyric-settings-select-option {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--text-secondary, rgba(148, 163, 184, 0.9)));
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s ease;
}

.tb-lyric-settings-select-option:hover {
  background: color-mix(in srgb, var(--color-text-main, #f8fafc) 8%, transparent);
}

.tb-lyric-settings-select-option.active {
  background: color-mix(in srgb, var(--color-primary, #31cfa1) 16%, transparent);
  color: var(--color-primary, #31cfa1);
}

@media (max-width: 640px) {
  .tb-lyric-settings-section {
    padding: 12px;
  }
}
`,
    { id: "taskbar-lyric" },
  );

  // 如果插件已启用，显示浮窗（位置由浮窗端自动检测任务栏并贴靠）
  if (state.settings.enabled) {
    showWindow(ctx);
  }

  // 监听启用状态变?
  const stopWatch = ctx.vue.watch(
    () => state.settings.enabled,
    (enabled) => {
      if (enabled) {
        showWindow(ctx);
      } else {
        hideWindow(ctx);
      }
    },
  );
  ctx.dispose(stopWatch);

  // 监听窗口尺寸变化 ?实际 resize 浮窗
  // 浮窗自身?sync+watch 会在检测到尺寸变化后调?positionToTaskbar 修正位置
  const stopWatchDim = ctx.vue.watch(
    () => [state.settings.windowWidth, state.settings.windowHeight],
    () => {
      if (state.settings.enabled) {
        showWindow(ctx);
      }
    },
    { flush: "post" },
  );
  ctx.dispose(stopWatchDim);

  // 窗口保活轮询：每 1s 轻量恢复置顶，通过 BroadcastChannel 心跳检测窗口存活。
  // 仅锁定时保活以免干扰拖拽。窗口真的死了（连续 3 次无心跳 = 6s）才重建。
  windowRecoveryTimer = setInterval(() => {
    try {
      if (state.settings.lockPosition) {
        recoverWindow(ctx);
      }
      // 通过 BroadcastChannel 心跳检测浮窗是否存活
      const sinceBeat = Date.now() - lastWindowHeartbeat;
      if (lastWindowHeartbeat && sinceBeat > 3000) {
        heartbeatMissCount++;
        if (heartbeatMissCount === 1) {
          // 首次丢失：轻量恢复置顶（可能是 Chromium 节流导致 show "刷新"）
          recoverWindow(ctx);
        } else if (heartbeatMissCount >= 3) {
          // 连续丢失 >=3 次（~9s）：窗口可能真的崩溃了，完整重建
          showWindow(ctx);
          heartbeatMissCount = 0;
        }
      } else if (sinceBeat <= 3000) {
        heartbeatMissCount = 0;
      }
    } catch { /* 忽略轮询错误 */ }
  }, 1000);
}

/**
 * 插件停用入口
 * @param {Object} ctx - 插件上下? */
export function deactivate(ctx) {
  hideWindow(ctx);
  ctx.windows.close(WINDOW_ID);
  if (windowRecoveryTimer) { clearInterval(windowRecoveryTimer); windowRecoveryTimer = null; }
  channel?.close();
  channel = null;
  settingsDispose?.();
  settingsDispose = null;
  state = null;
}
