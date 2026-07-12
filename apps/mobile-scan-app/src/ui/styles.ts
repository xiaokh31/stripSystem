export type NativeColorScheme = "dark" | "light";

export interface NativeThemeTokens {
  actionDisabled: string;
  actionPrimary: string;
  background: string;
  border: string;
  borderStrong: string;
  error: string;
  errorSoft: string;
  focus: string;
  success: string;
  successSoft: string;
  surface: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  textOnAction: string;
  warning: string;
  warningSoft: string;
}

const themeTokens: Record<NativeColorScheme, NativeThemeTokens> = {
  light: {
    actionDisabled: "#9CA3AF", actionPrimary: "#087F6D", background: "#EEF2F0",
    border: "#C9D0CC", borderStrong: "#6E7A75", error: "#B42318",
    errorSoft: "#FEE4E2", focus: "#0B9B86", success: "#087F6D",
    successSoft: "#DDF7EE", surface: "#FFFFFF", surfaceRaised: "#F6F8F6",
    textPrimary: "#17211F", textSecondary: "#46545A", textOnAction: "#FFFFFF", warning: "#9A5B00",
    warningSoft: "#FFF1CC",
  },
  dark: {
    actionDisabled: "#66736E", actionPrimary: "#41B8A2", background: "#18211F",
    border: "#47534F", borderStrong: "#9AA8A2", error: "#FF8B82",
    errorSoft: "#4A2425", focus: "#69D8C3", success: "#66D6B2",
    successSoft: "#173D34", surface: "#202B28", surfaceRaised: "#293531",
    textPrimary: "#F2F7F4", textSecondary: "#C3D0CA", textOnAction: "#10211B", warning: "#F6C56B",
    warningSoft: "#49391C",
  },
};

export function resolveNativeColorScheme(scheme: "dark" | "light" | null | undefined): NativeColorScheme {
  return scheme === "dark" ? "dark" : "light";
}

export function getNativeThemeTokens(scheme: NativeColorScheme): NativeThemeTokens {
  return themeTokens[scheme];
}

function createAppStyles(tokens: NativeThemeTokens) {
  return {
    appHeader: { alignItems: "center", flexDirection: "row", minHeight: 48 },
    appHeaderBrand: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 12 },
    actionRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
    body: { color: tokens.textSecondary, fontSize: 16, lineHeight: 22, marginTop: 10 },
    button: { alignItems: "center", backgroundColor: tokens.actionPrimary, minHeight: 48, justifyContent: "center", marginTop: 12, paddingHorizontal: 18 },
    buttonDisabled: { alignItems: "center", backgroundColor: tokens.actionDisabled, minHeight: 48, justifyContent: "center", marginTop: 12, paddingHorizontal: 18 },
    buttonText: { alignSelf: "stretch", color: tokens.textOnAction, fontSize: 16, fontWeight: "700", includeFontPadding: false, textAlign: "center", width: "100%" },
    content: { padding: 20 },
    confirmation: { borderColor: tokens.warning, borderWidth: 1, marginTop: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
    confirmationActive: { backgroundColor: tokens.warning, borderColor: tokens.warning, borderWidth: 1, marginTop: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
    confirmationActiveText: { alignSelf: "stretch", color: tokens.textOnAction, fontSize: 16, fontWeight: "800", includeFontPadding: false, textAlign: "center", width: "100%" },
    confirmationText: { color: tokens.warning, fontSize: 16, fontWeight: "800" },
    eyebrow: { color: tokens.actionPrimary, fontSize: 13, fontWeight: "800", lineHeight: 18, textTransform: "uppercase" },
    input: { backgroundColor: tokens.surfaceRaised, borderColor: tokens.border, borderWidth: 1, color: tokens.textPrimary, fontSize: 16, minHeight: 48, paddingHorizontal: 12 },
    iconButton: { alignItems: "center", borderColor: tokens.borderStrong, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
    iconButtonText: { color: tokens.textPrimary, fontSize: 22, fontWeight: "700" },
    iconButtonDisabled: { alignItems: "center", borderColor: tokens.actionDisabled, borderWidth: 1, height: 44, justifyContent: "center", opacity: 0.55, width: 44 },
    bayBoard: { backgroundColor: tokens.background, flex: 1, marginTop: 8 },
    bayBoardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 10 },
    bayRow: { backgroundColor: tokens.surface, borderColor: tokens.border, borderWidth: 1, marginTop: 8, minHeight: 184, padding: 14 },
    bayRowTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    bayProgress: { color: tokens.textPrimary, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "800" },
    bayMetaLine: { color: tokens.textSecondary, fontSize: 15, marginTop: 8 },
    bayReady: { color: tokens.success, fontSize: 14, fontWeight: "800", marginTop: 8 },
    bayBlocked: { color: tokens.error, fontSize: 14, fontWeight: "800", marginTop: 8 },
    label: { color: tokens.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 6 },
    labelSpaced: { color: tokens.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 6, marginTop: 12 },
    jobCard: { backgroundColor: tokens.surface, borderColor: tokens.border, borderWidth: 1, marginTop: 14, padding: 14 },
    jobDeparture: { color: tokens.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 6 },
    jobMetaGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    jobMetaItem: { borderColor: tokens.border, borderWidth: 1, minWidth: 130, padding: 8 },
    jobRegion: { color: tokens.actionPrimary, fontSize: 22, fontWeight: "900" },
    jobTitle: { color: tokens.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 4 },
    meta: { color: tokens.textSecondary, fontSize: 12, marginTop: 6 },
    metaLabel: { color: tokens.textSecondary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    metaValue: { color: tokens.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 3 },
    mono: { color: tokens.textPrimary, fontFamily: "monospace", fontSize: 14 },
    noticeError: { backgroundColor: tokens.errorSoft, borderColor: tokens.error, borderWidth: 1, marginTop: 12, padding: 12 },
    noticeMessage: { color: tokens.textSecondary, fontSize: 15, marginTop: 4 },
    noticeOk: { backgroundColor: tokens.successSoft, borderColor: tokens.success, borderWidth: 1, marginTop: 12, padding: 12 },
    noticeTitle: { color: tokens.textPrimary, fontSize: 17, fontWeight: "800" },
    noticeWarn: { backgroundColor: tokens.warningSoft, borderColor: tokens.warning, borderWidth: 1, marginTop: 12, padding: 12 },
    queueItem: { borderColor: tokens.border, borderWidth: 1, marginTop: 10, padding: 10 },
    screen: { backgroundColor: tokens.background, flex: 1 },
    scanFeedbackSlot: { minHeight: 86 },
    section: { backgroundColor: tokens.surface, borderColor: tokens.border, borderWidth: 1, marginTop: 18, padding: 14 },
    sectionTitle: { color: tokens.textPrimary, fontSize: 20, fontWeight: "800", marginBottom: 12 },
    secondaryButton: { alignItems: "center", borderColor: tokens.actionPrimary, borderWidth: 1, justifyContent: "center", marginTop: 12, minHeight: 48, paddingHorizontal: 18 },
    secondaryButtonText: { alignSelf: "stretch", color: tokens.actionPrimary, fontSize: 16, fontWeight: "700", includeFontPadding: false, textAlign: "center", width: "100%" },
    statusError: { color: tokens.error, fontSize: 18, fontWeight: "800" },
    statusMessage: { color: tokens.textSecondary, fontSize: 15, marginTop: 6 },
    statusOk: { color: tokens.success, fontSize: 18, fontWeight: "800" },
    statusPanel: { backgroundColor: tokens.surfaceRaised, borderColor: tokens.border, borderWidth: 1, marginTop: 18, padding: 14 },
    textArea: { backgroundColor: tokens.surfaceRaised, borderColor: tokens.border, borderWidth: 1, color: tokens.textPrimary, fontSize: 16, minHeight: 92, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" },
    title: { color: tokens.textPrimary, fontSize: 30, fontWeight: "800", marginTop: 4 },
    userName: { color: tokens.textPrimary, fontSize: 18, fontWeight: "800" },
    userPanel: { backgroundColor: tokens.surfaceRaised, borderColor: tokens.border, borderWidth: 1, marginBottom: 12, padding: 12 },
  } as const;
}

const styleCache: Partial<Record<NativeColorScheme, ReturnType<typeof createAppStyles>>> = {};

export function getAppStyles(scheme: NativeColorScheme) {
  return (styleCache[scheme] ??= createAppStyles(getNativeThemeTokens(scheme)));
}

export let appStyles = getAppStyles("light");

export function setAppColorScheme(scheme: NativeColorScheme): void {
  appStyles = getAppStyles(scheme);
}
