// React Native mock — provides the minimal surface needed by
// @testing-library/react-native and our source modules
jest.mock("react-native", () => {
  const React = require("react");
  let appStateListeners = [];
  return {
    Platform: { OS: "ios", select: (obj) => obj.ios },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => style,
    },
    Dimensions: {
      get: () => ({ width: 375, height: 812 }),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      isBoldTextEnabled: jest.fn(() => Promise.resolve(false)),
      isGrayscaleEnabled: jest.fn(() => Promise.resolve(false)),
      isInvertColorsEnabled: jest.fn(() => Promise.resolve(false)),
      isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
    },
    Appearance: {
      getColorScheme: jest.fn(() => "light"),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    AppState: {
      currentState: "active",
      addEventListener: jest.fn((event, cb) => {
        appStateListeners.push(cb);
        return {
          remove: jest.fn(() => {
            appStateListeners = appStateListeners.filter((l) => l !== cb);
          }),
        };
      }),
      __simulateChange: (state) => {
        appStateListeners.forEach((cb) => cb(state));
      },
      __resetListeners: () => {
        appStateListeners = [];
      },
    },
    View: "View",
    Text: "Text",
    TextInput: "TextInput",
    Image: "Image",
    ScrollView: "ScrollView",
    TouchableOpacity: "TouchableOpacity",
    NativeModules: {},
    NativeEventEmitter: jest.fn(() => ({
      addListener: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
    I18nManager: { isRTL: false },
    PixelRatio: { get: () => 2, getFontScale: () => 1, roundToNearestPixel: (v) => v },
    Vibration: { vibrate: jest.fn(), cancel: jest.fn() },
    Linking: {
      openURL: jest.fn(),
      canOpenURL: jest.fn(() => Promise.resolve(true)),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      getInitialURL: jest.fn(() => Promise.resolve(null)),
    },
  };
});

// AsyncStorage mock
jest.mock("@react-native-async-storage/async-storage", () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key, value) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
      __getStore: () => store,
      __resetStore: () => {
        store = {};
      },
    },
  };
});

// NetInfo mock
jest.mock("@react-native-community/netinfo", () => {
  let listener = null;
  return {
    __esModule: true,
    default: {
      addEventListener: jest.fn((cb) => {
        listener = cb;
        return () => {
          listener = null;
        };
      }),
      __simulateChange: (state) => listener?.(state),
    },
  };
});

// trpcVanilla mock
jest.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));
