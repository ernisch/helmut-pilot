/* @ds-bundle: {"format":4,"namespace":"HelmutDesignSystem_67bea3","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"Panel","sourcePath":"components/core/Panel.jsx"},{"name":"PriorityItem","sourcePath":"components/core/PriorityItem.jsx"},{"name":"SectionHeading","sourcePath":"components/core/SectionHeading.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Wordmark","sourcePath":"components/core/Wordmark.jsx"}],"sourceHashes":{"components/core/Button.jsx":"9fd3770d4141","components/core/Card.jsx":"ef183a763c89","components/core/Eyebrow.jsx":"e537f9e7a22e","components/core/Panel.jsx":"7e56926c2268","components/core/PriorityItem.jsx":"02c7a0fdbb83","components/core/SectionHeading.jsx":"2e5f3f9d5122","components/core/Tag.jsx":"5b70e89e8b56","components/core/Wordmark.jsx":"d337353f2bc4","ui_kits/app/shell.jsx":"1ae111af0d8b","ui_kits/app/views.jsx":"691784028d2b","ui_kits/website/site.jsx":"2971982143d4"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.HelmutDesignSystem_67bea3 = window.HelmutDesignSystem_67bea3 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Helmut primary action. Two brand variants: `solid` (light surface,
 * dark ink — the main call to action) and `ghost` (hairline border,
 * ink text). Renders as <a> when `href` is set, else <button>.
 */
function Button({
  children,
  variant = "solid",
  size = "md",
  href,
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const pad = size === "sm" ? "9px 17px" : "13px 26px";
  const fs = size === "sm" ? 13.5 : 15;
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "var(--font-body)",
    fontWeight: 600,
    fontSize: fs,
    lineHeight: 1,
    padding: pad,
    borderRadius: "var(--r-sm)",
    border: "1px solid transparent",
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background var(--dur-base) var(--ease), color var(--dur-base) var(--ease), border-color var(--dur-base) var(--ease)",
    whiteSpace: "nowrap"
  };
  const variants = {
    solid: {
      background: hover && !disabled ? "var(--solid-hover)" : "var(--solid)",
      color: "var(--on-solid)"
    },
    ghost: {
      background: "transparent",
      color: hover && !disabled ? "var(--ink)" : "var(--text)",
      borderColor: hover && !disabled ? "var(--line-strong)" : "var(--line-2)"
    }
  };
  const Tag = href ? "a" : "button";
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    onClick: disabled ? undefined : onClick,
    disabled: Tag === "button" ? disabled : undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Surface panel. A hairline-bordered container on a raised navy fill.
 * `elevated` adds the deep panel shadow; `tone` picks the fill step.
 * Interactive cards lift 1px on hover when `hover` is set.
 */
function Card({
  children,
  tone = "raised",
  elevated = false,
  hover = false,
  padding = 24,
  style,
  ...rest
}) {
  const [h, setH] = React.useState(false);
  const bg = tone === "card" ? "var(--bg-2)" : tone === "page" ? "var(--bg)" : "var(--bg-1)";
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: hover ? () => setH(true) : undefined,
    onMouseLeave: hover ? () => setH(false) : undefined,
    style: {
      background: bg,
      border: "1px solid " + (h ? "var(--line-2)" : "var(--line)"),
      borderRadius: "var(--r-md)",
      padding,
      boxShadow: elevated ? "var(--shadow-panel)" : "none",
      transform: h ? "translateY(-1px)" : "none",
      transition: "transform var(--dur-base) var(--ease), border-color var(--dur-base) var(--ease)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Mono uppercase kicker label used above every section heading and as
 * metadata. Optional leading accent dot. Wide tracking is intrinsic to
 * the brand — don't override letter-spacing.
 */
function Eyebrow({
  children,
  dot = false,
  tone = "muted",
  style,
  ...rest
}) {
  const color = tone === "accent" ? "var(--accent)" : "var(--muted)";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-eyebrow)",
      fontWeight: 400,
      letterSpacing: "var(--ls-eyebrow)",
      textTransform: "uppercase",
      color,
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "var(--accent)",
      flex: "none"
    }
  }), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Panel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Framed panel with the signature top accent line (a 2px hairline that
 * fades in from both edges). Optional header row (title + meta). Used
 * for the briefing panel and any showcased, elevated content block.
 */
function Panel({
  title,
  meta,
  children,
  elevated = true,
  style,
  bodyStyle,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      border: "1px solid var(--line-2)",
      background: "var(--bg)",
      borderRadius: "var(--r-md)",
      overflow: "hidden",
      boxShadow: elevated ? "var(--shadow-panel)" : "none",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      background: "linear-gradient(90deg, transparent, var(--accent-line), transparent)"
    }
  }), (title || meta) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "16px 22px",
      borderBottom: "1px solid var(--line)"
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 16,
      color: "var(--ink)"
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, meta)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px 22px",
      ...bodyStyle
    }
  }, children));
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Panel.jsx", error: String((e && e.message) || e) }); }

// components/core/SectionHeading.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Section header: mono eyebrow over a Spectral heading, with an
 * optional lead paragraph. Centre-aligned by default (marketing);
 * pass align="left" for in-app use.
 */
function SectionHeading({
  eyebrow,
  dot = false,
  title,
  lead,
  align = "center",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      textAlign: align,
      maxWidth: align === "center" ? "var(--max-text)" : "none",
      marginLeft: align === "center" ? "auto" : 0,
      marginRight: align === "center" ? "auto" : 0,
      ...style
    }
  }, rest), eyebrow && /*#__PURE__*/React.createElement(__ds_scope.Eyebrow, {
    dot: dot
  }, eyebrow), title && /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-display)",
      fontSize: "var(--fs-h2)",
      lineHeight: "var(--lh-heading)",
      letterSpacing: "-.01em",
      color: "var(--ink)",
      margin: eyebrow ? "15px 0 0" : 0,
      textWrap: "balance"
    }
  }, title), lead && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-body-sm)",
      lineHeight: 1.65,
      color: "var(--text-2)",
      margin: "20px 0 0",
      maxWidth: align === "center" ? "58ch" : "62ch",
      marginLeft: align === "center" ? "auto" : 0,
      marginRight: align === "center" ? "auto" : 0,
      textWrap: "pretty"
    }
  }, lead));
}
Object.assign(__ds_scope, { SectionHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SectionHeading.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Small mono uppercase label. `tag` = square-cornered bordered chip
 * (category markers: Reaktion / Chance / Risiko …). `pill` = rounded
 * filter/topic pill. `tone` tints the text with a signal colour.
 */
function Tag({
  children,
  variant = "tag",
  tone = "default",
  style,
  ...rest
}) {
  const toneColor = {
    default: "var(--text)",
    risk: "var(--risk)",
    chance: "var(--chance)",
    watch: "var(--watch)",
    accent: "var(--accent)"
  }[tone];
  const base = {
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 400,
    letterSpacing: "var(--ls-label)",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    color: toneColor,
    border: "1px solid var(--line-2)"
  };
  const variants = {
    tag: {
      padding: "3px 7px",
      borderRadius: 2
    },
    pill: {
      padding: "6px 14px",
      borderRadius: "var(--r-pill)",
      fontFamily: "var(--font-body)",
      fontSize: 13,
      letterSpacing: 0,
      textTransform: "none",
      color: tone === "default" ? "var(--text-2)" : toneColor,
      borderColor: "var(--line)"
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/core/PriorityItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * A single briefing / agenda row: a priority dot (state), a title and
 * supporting line, and an optional trailing category Tag. The dot
 * encodes urgency — filled accent = act, hollow ring = watch, faint =
 * can wait. This is the core editorial "ledger" row of the product.
 */
function PriorityItem({
  title,
  note,
  state = "act",
  tag,
  tagTone,
  style,
  ...rest
}) {
  const dot = state === "act" ? {
    background: "var(--accent)"
  } : state === "watch" ? {
    background: "transparent",
    border: "1.5px solid var(--line-strong)"
  } : {
    background: "rgba(255,255,255,.14)"
  };
  const dim = state === "wait";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "grid",
      gridTemplateColumns: "18px minmax(0,1fr) auto",
      gap: 14,
      alignItems: "start",
      padding: "17px 0",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      marginTop: 5,
      ...dot
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: dim ? 14 : 15,
      fontWeight: dim ? 400 : 600,
      color: dim ? "var(--text-2)" : "var(--ink)",
      lineHeight: 1.35
    }
  }, title), note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: dim ? 12.5 : 13.5,
      color: dim ? "var(--muted)" : "var(--text-2)",
      lineHeight: 1.5,
      marginTop: 3
    }
  }, note)), tag && /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    tone: tagTone || "default"
  }, tag));
}
Object.assign(__ds_scope, { PriorityItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/PriorityItem.jsx", error: String((e && e.message) || e) }); }

// components/core/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Helmut lockup: a serif "H" in a light rounded square beside the
 * "Helmut" wordmark (Spectral). Set `markOnly` for just the square.
 * Scales via `size` (the square/wordmark derive from it).
 */
function Wordmark({
  size = 28,
  markOnly = false,
  style,
  ...rest
}) {
  const sq = Math.round(size * 1.35);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: Math.round(size * 0.42),
      color: "var(--ink)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: sq,
      height: sq,
      borderRadius: Math.round(sq * 0.29),
      background: "var(--mark-square)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 400,
      fontSize: Math.round(sq * 0.6),
      color: "var(--mark-ink)",
      lineHeight: 1
    }
  }, "H")), !markOnly && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 400,
      fontSize: size,
      letterSpacing: "var(--ls-tight)"
    }
  }, "Helmut"));
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Wordmark.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/shell.jsx
try { (() => {
// Helmut app UI kit — interactive recreation of the PWA (Lage / Radar / Briefing / Büro).
// Refined brand (Spectral / Hanken / Plex Mono, single blue accent), matching the
// briefing-interface mock shipped on the marketing site. Composes DS primitives.
const {
  Button,
  Eyebrow,
  Tag,
  Wordmark,
  Card,
  Panel,
  PriorityItem,
  SectionHeading
} = window.HelmutDesignSystem_67bea3;
const {
  useState
} = React;
const AREAS = [{
  id: "lage",
  label: "Lage",
  hint: "Überblick"
}, {
  id: "radar",
  label: "Radar",
  hint: "Umfeld"
}, {
  id: "briefing",
  label: "Briefing",
  hint: "Empfehlung"
}, {
  id: "buero",
  label: "Büro",
  hint: "Umsetzung"
}];
function Sidebar({
  view,
  setView
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      position: "sticky",
      top: 0,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      height: "100dvh",
      padding: "40px 24px 30px",
      borderRight: "1px solid var(--line)",
      background: "var(--bg-footer)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 52
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 22
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "grid",
      gap: 4
    }
  }, AREAS.map(a => {
    const active = view === a.id;
    return /*#__PURE__*/React.createElement("button", {
      key: a.id,
      onClick: () => setView(a.id),
      style: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        appearance: "none",
        border: 0,
        background: active ? "rgba(255,255,255,.04)" : "transparent",
        textAlign: "left",
        padding: "11px 14px",
        borderRadius: "var(--r-sm)",
        cursor: "pointer",
        transition: "background var(--dur-base) var(--ease)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-display)",
        fontSize: 18,
        color: active ? "var(--ink)" : "var(--text-2)"
      }
    }, a.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        letterSpacing: ".16em",
        textTransform: "uppercase",
        color: "var(--muted)"
      }
    }, a.hint), active && /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: 0,
        top: "50%",
        transform: "translateY(-50%)",
        width: 2,
        height: 26,
        borderRadius: 999,
        background: "var(--accent)"
      }
    }));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--text-2)",
      lineHeight: 1.4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--ink)",
      fontWeight: 600
    }
  }, "Cem Ince"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "MdB \xB7 Arbeit & Soziales")));
}
function Topbar({
  onLogout
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 32,
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Di \xB7 15. Juli \xB7 07:14"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "grid",
      placeItems: "center",
      width: 30,
      height: 30,
      color: "var(--accent)"
    },
    title: "Aktualisierungen"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13.7 21a2 2 0 0 1-3.4 0"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 3,
      right: 3,
      width: 7,
      height: 7,
      borderRadius: 999,
      background: "var(--signature,#a54562)",
      boxShadow: "0 0 0 2px var(--bg)"
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: onLogout
  }, "Abmelden")));
}
function PageIntro({
  eyebrow,
  title,
  lead
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 116,
      height: 2,
      marginBottom: 26,
      background: "linear-gradient(90deg, var(--accent-line), transparent)"
    }
  }), /*#__PURE__*/React.createElement(Eyebrow, {
    dot: true
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: "clamp(40px,5vw,58px)",
      lineHeight: 1.02,
      letterSpacing: "-.02em",
      color: "var(--ink)",
      margin: "16px 0 0",
      maxWidth: "18ch",
      textWrap: "balance"
    }
  }, title), lead && /*#__PURE__*/React.createElement("p", {
    style: {
      maxWidth: "56ch",
      margin: "18px 0 0",
      color: "var(--text-2)",
      fontSize: 18,
      lineHeight: 1.55
    }
  }, lead));
}
function SectionLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: "var(--muted)",
      margin: "0 0 14px"
    }
  }, children);
}
window.HelmutApp = {
  AREAS,
  Sidebar,
  Topbar,
  PageIntro,
  SectionLabel
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/views.jsx
try { (() => {
// Helmut app screens: Access + the four areas.
const {
  Button,
  Eyebrow,
  Tag,
  Wordmark,
  Card,
  Panel,
  PriorityItem
} = window.HelmutDesignSystem_67bea3;
const {
  PageIntro,
  SectionLabel
} = window.HelmutApp;
const {
  useState
} = React;
function AccessScreen({
  onEnter
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(" ");
  const submit = () => {
    if (code.trim().toLowerCase() === "nohut" || code.trim() === "") onEnter();else setErr("Zugangscode nicht erkannt.");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "radial-gradient(90% 60% at 50% -8%, var(--accent-dim), transparent 60%)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "min(100%, 420px)",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      marginBottom: 30
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 30
  })), /*#__PURE__*/React.createElement(Eyebrow, {
    dot: true
  }, "Politischer KI-Stabschef"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: 34,
      lineHeight: 1.1,
      letterSpacing: "-.015em",
      color: "var(--ink)",
      margin: "16px 0 10px"
    }
  }, "Guten Morgen."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--text-2)",
      fontSize: 16,
      lineHeight: 1.5,
      margin: "0 auto 26px",
      maxWidth: "34ch"
    }
  }, "Ihre Morgenlage ist vorbereitet. Bitte mit Ihrem Zugang fortfahren."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 12,
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: code,
    onChange: e => {
      setCode(e.target.value);
      setErr(" ");
    },
    onKeyDown: e => e.key === "Enter" && submit(),
    placeholder: "Zugangscode",
    style: {
      width: "100%",
      minHeight: 54,
      border: "1px solid var(--line-2)",
      borderRadius: "var(--r-sm)",
      padding: "0 16px",
      color: "var(--ink)",
      background: "rgba(255,255,255,.05)",
      font: "inherit",
      fontSize: 16,
      outline: "none"
    }
  }), /*#__PURE__*/React.createElement("small", {
    style: {
      minHeight: 18,
      color: "var(--risk)",
      fontSize: 13
    }
  }, err), /*#__PURE__*/React.createElement(Button, {
    onClick: submit,
    style: {
      width: "100%"
    }
  }, "Morgenlage \xF6ffnen")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: ".06em",
      color: "var(--muted-2)",
      margin: "24px 0 0"
    }
  }, "Keine automatische Ver\xF6ffentlichung \xB7 Die Entscheidung bleibt bei Ihnen")));
}
function Briefing() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageIntro, {
    eyebrow: "Briefing \xB7 15. Juli",
    title: "Drei Dinge zuerst.",
    lead: "Der Rest kann warten. Helmut hat 214 Meldungen gelesen \u2014 hier ist, was heute z\xE4hlt."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 22
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "Helmuts Einsch\xE4tzung",
    meta: "07:14",
    elevated: false
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: "clamp(22px,2.6vw,30px)",
      lineHeight: 1.25,
      letterSpacing: "-.01em",
      color: "var(--ink)"
    }
  }, "Der vorgezogene Netzausbau-Termin ist heute Ihr einziger echter Handlungsdruck. Alles andere vertr\xE4gt Beobachtung.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Heute zuerst"), /*#__PURE__*/React.createElement(Card, {
    padding: 0,
    style: {
      padding: "4px 22px"
    }
  }, /*#__PURE__*/React.createElement(PriorityItem, {
    state: "act",
    title: "Anh\xF6rung zum Netzausbau vorgezogen",
    note: "Empfehlung: kurzes Statement bis 12:00 abstimmen \u2014 Ausschuss tagt Donnerstag.",
    tag: "Reaktion"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--line)"
    }
  }), /*#__PURE__*/React.createElement(PriorityItem, {
    state: "watch",
    title: "Kommunale Finanzhilfe \xFCberregional beachtet",
    note: "Gelegenheit f\xFCr eine regionale Einordnung in der Fragestunde.",
    tag: "Chance",
    tagTone: "chance"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--line)"
    }
  }), /*#__PURE__*/React.createElement(PriorityItem, {
    state: "watch",
    title: "Pflegereform: Verb\xE4ndekritik nimmt zu",
    note: "K\xF6nnte zum Thema werden. Position bis Ende der Woche sch\xE4rfen.",
    tag: "Risiko",
    tagTone: "risk"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Kann heute warten"), /*#__PURE__*/React.createElement(Card, {
    padding: 0,
    style: {
      padding: "4px 22px"
    }
  }, /*#__PURE__*/React.createElement(PriorityItem, {
    state: "wait",
    title: "Verb\xE4ndeanh\xF6rung verschoben",
    note: "Keine Reaktion n\xF6tig \u2014 Termin r\xFCckt in KW 30."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--line)"
    }
  }), /*#__PURE__*/React.createElement(PriorityItem, {
    state: "wait",
    title: "Statistisches Bundesamt: Quartalszahlen",
    note: "Zur Kenntnis. Keine unmittelbare Relevanz f\xFCr das Mandat."
  })))));
}
function Lage() {
  const rows = [{
    t: "Bundeshaushalt 2027 — erste Lesung terminiert",
    n: "Der Entwurf steht. Die Sozialausgaben bleiben der zentrale Streitpunkt zwischen den Fraktionen.",
    tag: "Bundestag"
  }, {
    t: "Netzausbau: Kabinett beschließt Beschleunigungsgesetz",
    n: "Verkürzte Anhörungsfristen. Betrifft mehrere laufende Ausschussverfahren.",
    tag: "Regierung"
  }, {
    t: "Pflegereform vor Verbändeanhörung",
    n: "Breite Kritik aus der Wohlfahrtspflege. Öffentliche Aufmerksamkeit steigt.",
    tag: "Sozial"
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageIntro, {
    eyebrow: "Lage \xB7 \xDCberblick",
    title: "Was heute wichtig ist.",
    lead: "Der objektive politische \xDCberblick \u2014 unabh\xE4ngig vom Mandat."
  }), /*#__PURE__*/React.createElement(SectionLabel, null, "Bundespolitik"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 12
    }
  }, rows.map((r, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    hover: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 20,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: 22,
      color: "var(--ink)",
      lineHeight: 1.15,
      letterSpacing: "-.01em"
    }
  }, r.t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "8px 0 0",
      color: "var(--text-2)",
      fontSize: 15,
      lineHeight: 1.5,
      maxWidth: "62ch"
    }
  }, r.n)), /*#__PURE__*/React.createElement(Tag, {
    variant: "pill"
  }, r.tag))))));
}
function Radar() {
  const items = [{
    k: "Erwähnung",
    t: "Regionalpresse zitiert Ihre Rede zur Tarifbindung",
    s: "Rheinische Post · vor 2 Std.",
    tone: "accent"
  }, {
    k: "Person",
    t: "Ausschussvorsitzende kündigt Zeitplan-Änderung an",
    s: "X / Fraktion · vor 4 Std.",
    tone: "default"
  }, {
    k: "Region",
    t: "Kreistag beschließt Resolution zur Krankenhausfinanzierung",
    s: "Lokalfunk · gestern",
    tone: "chance"
  }, {
    k: "Thema",
    t: "Mindestlohn-Debatte gewinnt bundesweit an Fahrt",
    s: "dpa · gestern",
    tone: "watch"
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageIntro, {
    eyebrow: "Radar \xB7 Umfeld",
    title: "Rund um Ihr Mandat.",
    lead: "Themen, Personen und Region, die Sie betreffen."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 0
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) auto",
      gap: 18,
      alignItems: "center",
      padding: "20px 0",
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Tag, {
    tone: it.tone
  }, it.k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: "var(--ink)",
      margin: "10px 0 4px",
      lineHeight: 1.3
    }
  }, it.t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      color: "var(--muted)"
    }
  }, it.s)), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Quelle")))));
}
function Buero() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageIntro, {
    eyebrow: "B\xFCro \xB7 Umsetzung",
    title: "Vorbereitet, nicht versendet.",
    lead: "Arbeitsprodukte liegen bereit. Sie entscheiden, was hinausgeht."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "Statement \u2014 Netzausbau",
    meta: "Entwurf",
    elevated: false,
    bodyStyle: {
      padding: "22px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: "var(--text)",
      fontSize: 15.5,
      lineHeight: 1.65,
      maxWidth: "64ch"
    }
  }, "\u201EDer beschleunigte Netzausbau ist notwendig \u2014 aber er darf die Beteiligung der Kommunen nicht \xFCberspringen. Ich werde in der Anh\xF6rung am Donnerstag darauf dringen, dass die verk\xFCrzten Fristen mit klaren Mitwirkungsrechten ausgeglichen werden.\""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 20,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "\xDCbernehmen"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Bearbeiten"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Verwerfen"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
      gap: 12
    }
  }, [{
    k: "Argumentationslinie",
    t: "Pflegereform — drei Kernpunkte",
    n: "Für die Fraktionssitzung am Mittwoch."
  }, {
    k: "Pressetext",
    t: "Regionale Einordnung Finanzhilfe",
    n: "Kurzfassung für die Lokalpresse."
  }, {
    k: "Ausschussfrage",
    t: "Nachfrage zu den Fristen",
    n: "Vorbereitet für Donnerstag."
  }].map((c, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    hover: true
  }, /*#__PURE__*/React.createElement(Tag, null, c.k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--ink)",
      margin: "12px 0 5px",
      lineHeight: 1.3
    }
  }, c.t), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)",
      fontSize: 13.5,
      lineHeight: 1.5
    }
  }, c.n))))));
}
window.HelmutScreens = {
  AccessScreen,
  Briefing,
  Lage,
  Radar,
  Buero
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/views.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/site.jsx
try { (() => {
// Helmut marketing website — faithful recreation composing DS primitives.
const {
  Button,
  Eyebrow,
  Tag,
  Wordmark,
  Card,
  SectionHeading,
  Panel,
  PriorityItem
} = window.HelmutDesignSystem_67bea3;
const MAX = "var(--max)",
  NARROW = "var(--max-narrow)",
  TEXT = "var(--max-text)";
const secBase = {
  padding: "clamp(52px,8vw,var(--sy)) var(--px)",
  borderTop: "1px solid var(--line)"
};
function Header() {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 30,
      background: "rgba(7,11,22,.72)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      maxWidth: MAX,
      margin: "0 auto",
      padding: "15px var(--px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "12px 26px"
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: 21
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: "12px 22px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 26
    }
  }, ["Produkt", "Für wen", "Sicherheit"].map(t => /*#__PURE__*/React.createElement("a", {
    key: t,
    href: "#",
    style: {
      fontSize: 13.5,
      color: "var(--text-2)",
      textDecoration: "none"
    }
  }, t))), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "Zugang"))));
}
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "clamp(72px,11vw,128px) var(--px) clamp(56px,8vw,92px)",
      textAlign: "center",
      background: "radial-gradient(92% 62% at 50% -8%, var(--accent-dim), transparent 62%)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: NARROW,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 26,
      display: "flex",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    dot: true
  }, "Politischer KI-Stabschef")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: "clamp(38px,6.4vw,62px)",
      lineHeight: 1.06,
      letterSpacing: "-.015em",
      color: "var(--ink)",
      margin: "0 auto",
      maxWidth: "16ch",
      textWrap: "balance"
    }
  }, "Der politische KI-Stabschef."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "clamp(17px,2.4vw,19.5px)",
      lineHeight: 1.55,
      color: "var(--text)",
      margin: "26px auto 0",
      maxWidth: "48ch",
      textWrap: "pretty"
    }
  }, "Helmut zeigt nicht nur, was passiert ist. Helmut sagt, was jetzt zu tun ist."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      justifyContent: "center",
      flexWrap: "wrap",
      marginTop: 38
    }
  }, /*#__PURE__*/React.createElement(Button, null, "Zugang"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Pilot anfragen")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: ".06em",
      color: "var(--muted-2)",
      margin: "26px 0 0"
    }
  }, "Keine automatische Ver\xF6ffentlichung \xB7 Die Entscheidung bleibt bei Ihnen")));
}
function Problem() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      ...secBase,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Das Problem",
    title: "Nicht zu wenig Information. Zu wenig Priorisierung.",
    lead: "Nachrichten, Pressemitteilungen, parlamentarische Vorg\xE4nge, regionale Entwicklungen und Termine konkurrieren jeden Morgen um dieselbe Aufmerksamkeit. Helmut ordnet, gewichtet \u2014 und empfiehlt."
  }));
}
const DELIVERS = [["Was heute zählt", "Die wenigen Entwicklungen, die heute wirklich relevant sind.", "Priorität"], ["Was ignoriert werden kann", "Rauschen, das heute keine Reaktion verlangt.", "Ruhe"], ["Worauf zu reagieren ist", "Vorgänge mit Frist — inklusive Zeitfenster.", "Reaktion"], ["Welche Chancen entstehen", "Politische Gelegenheiten, die sich gerade öffnen.", "Chance"], ["Welche Risiken entstehen", "Themen, die zum Problem werden können.", "Risiko"], ["Empfohlene Kommunikation", "Ein Vorschlag, wie und wann reagiert wird.", "Entwurf"]];
function Delivers() {
  return /*#__PURE__*/React.createElement("section", {
    style: secBase
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Jeden Morgen",
    title: "Was Helmut morgens liefert."
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      maxWidth: 760,
      margin: "32px auto 0",
      padding: 0,
      listStyle: "none"
    }
  }, DELIVERS.map(([t, d, tag], i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "16px 20px",
      alignItems: "baseline",
      padding: "20px 0",
      borderTop: "1px solid var(--line)",
      borderBottom: i === DELIVERS.length - 1 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16.5,
      fontWeight: 500,
      color: "var(--ink)"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-2)",
      marginTop: 3,
      lineHeight: 1.5
    }
  }, d)), /*#__PURE__*/React.createElement(Tag, null, tag)))));
}
function BriefingShowcase() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      ...secBase,
      background: "var(--bg-1)"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Das Briefing",
    title: "Was auf dem Schreibtisch liegt \u2014 in 30 Sekunden."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 680,
      margin: "34px auto 0"
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "Morgenbriefing",
    meta: "Di \xB7 15. Juli \xB7 07:14",
    bodyStyle: {
      padding: "20px 22px 6px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: "var(--muted)",
      marginBottom: 6
    }
  }, "Heute zuerst"), /*#__PURE__*/React.createElement(PriorityItem, {
    state: "act",
    title: "Anh\xF6rung zum Netzausbau vorgezogen",
    note: "Empfehlung: kurzes Statement bis 12:00 abstimmen \u2014 Ausschuss tagt Donnerstag.",
    tag: "Reaktion"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--line)"
    }
  }), /*#__PURE__*/React.createElement(PriorityItem, {
    state: "watch",
    title: "Kommunale Finanzhilfe \xFCberregional beachtet",
    note: "Empfehlung: Gelegenheit f\xFCr eine regionale Einordnung in der Fragestunde.",
    tag: "Chance",
    tagTone: "chance"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--line)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: "var(--muted)",
      margin: "17px 0 4px"
    }
  }, "Kann heute warten"), /*#__PURE__*/React.createElement(PriorityItem, {
    state: "wait",
    title: "Verb\xE4ndeanh\xF6rung verschoben",
    note: "Keine Reaktion n\xF6tig \u2014 Termin r\xFCckt in KW 30."
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: "center",
      fontSize: 12.5,
      color: "var(--muted)",
      margin: "18px auto 0",
      maxWidth: "52ch"
    }
  }, "Beispielhafte Darstellung. Inhalte sind fiktiv und dienen nur der Veranschaulichung.")));
}
const AREAS = [["Lage", "Überblick", "Der objektive politische Überblick. Was heute — unabhängig vom Mandat — wichtig ist."], ["Radar", "Umfeld", "Entwicklungen rund um das Mandat: Themen, Personen, Region und politisches Umfeld des Nutzers."], ["Briefing", "Empfehlung", "Konkrete Prioritäten und Handlungsempfehlungen. Was jetzt zu tun ist — und warum."], ["Büro", "Umsetzung", "Vorbereitete Arbeitsprodukte: Statements, Argumentationen, Briefings und Kommunikationsentwürfe."]];
function Areas() {
  return /*#__PURE__*/React.createElement("section", {
    style: secBase
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Die vier Bereiche",
    title: "Vier Bereiche, klar getrennt."
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      maxWidth: NARROW,
      margin: "30px auto 0",
      padding: 0,
      listStyle: "none"
    }
  }, AREAS.map(([name, kick, desc], i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "10px 28px",
      alignItems: "baseline",
      padding: "26px 0",
      borderTop: "1px solid var(--line)",
      borderBottom: i === AREAS.length - 1 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "0 0 200px",
      minWidth: 160
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: 23,
      color: "var(--ink)"
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: "var(--muted)",
      marginTop: 6
    }
  }, kick)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "1 1 320px",
      fontSize: 15.5,
      lineHeight: 1.6,
      color: "var(--text-2)"
    }
  }, desc)))));
}
const WHO = [["Bundestagsabgeordnete", "Mandat, Ausschüsse und Wahlkreis — täglich im Blick."], ["Landtagsabgeordnete", "Landespolitik und Region in einem Briefing."], ["Büroleitung & Referenten", "Vorbereitung, die morgens schon fertig ist."], ["Fraktionen", "Ein gemeinsames Lagebild für das ganze Team."]];
function Who() {
  return /*#__PURE__*/React.createElement("section", {
    style: secBase
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "F\xFCr wen",
    title: "F\xFCr die, die morgens entscheiden."
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      maxWidth: MAX,
      margin: "32px auto 0",
      padding: 0,
      listStyle: "none",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
      gap: 14
    }
  }, WHO.map(([t, d], i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 7,
      height: 7,
      background: "var(--accent)",
      borderRadius: "50%",
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--text-2)",
      marginTop: 6,
      lineHeight: 1.55
    }
  }, d))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: MAX,
      margin: "22px auto 0",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Sp\xE4ter auch"), ["Ministerien", "Verbände", "Pressestellen", "Public-Affairs-Teams"].map(t => /*#__PURE__*/React.createElement(Tag, {
    key: t,
    variant: "pill"
  }, t))));
}
const TRUST = [["Keine automatische Veröffentlichung", "Helmut handelt nie eigenständig nach außen."], ["Entscheidungshoheit", "Jede Empfehlung ist ein Vorschlag. Die Entscheidung bleibt beim Nutzer."], ["Nachvollziehbare Quellen", "Einordnungen lassen sich auf ihre Grundlage zurückführen."], ["Kenntlich gemachte Unsicherheit", "Wo etwas unsicher ist, weist Helmut darauf hin."], ["Getrennte Nutzerbereiche", "Inhalte verschiedener Nutzer werden getrennt behandelt."], ["Zurückhaltung als Prinzip", "Im Zweifel weniger — dafür belastbar."]];
function Trust() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      ...secBase,
      background: "var(--bg-1)"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Vertrauen & Sicherheit",
    title: "Ein Werkzeug, das zur\xFCckhaltend bleibt."
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      maxWidth: MAX,
      margin: "32px auto 0",
      padding: 0,
      listStyle: "none",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
      gap: "0 44px"
    }
  }, TRUST.map(([t, d], i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      padding: "22px 0",
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-2)",
      marginTop: 5,
      lineHeight: 1.55
    }
  }, d)))));
}
function Closing() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "clamp(64px,10vw,116px) var(--px)",
      borderTop: "1px solid var(--line)",
      textAlign: "center",
      background: "radial-gradient(90% 70% at 50% 120%, var(--accent-dim), transparent 60%)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: TEXT,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: "clamp(32px,5.2vw,50px)",
      lineHeight: 1.08,
      letterSpacing: "-.01em",
      color: "var(--ink)",
      margin: 0,
      textWrap: "balance"
    }
  }, "Morgens wissen, was z\xE4hlt."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "clamp(15.5px,2vw,17px)",
      lineHeight: 1.6,
      color: "var(--text-2)",
      margin: "22px auto 0",
      maxWidth: "46ch"
    }
  }, "Sehen Sie Helmut in Aktion \u2014 oder sprechen Sie mit uns \xFCber einen Pilotzugang."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      justifyContent: "center",
      flexWrap: "wrap",
      marginTop: 34
    }
  }, /*#__PURE__*/React.createElement(Button, null, "Zugang zu Helmut"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Pilot anfragen"))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--bg-footer)",
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: MAX,
      margin: "0 auto",
      padding: "clamp(40px,6vw,56px) var(--px)",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: "28px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Wordmark, {
    size: 20
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: "var(--muted)",
      marginTop: 8
    }
  }, "Politischer KI-Stabschef")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "14px 28px",
      alignItems: "flex-start"
    }
  }, ["Impressum", "Datenschutz", "Kontakt"].map(t => /*#__PURE__*/React.createElement("a", {
    key: t,
    href: "#",
    style: {
      fontSize: 13.5,
      color: "var(--text-2)",
      textDecoration: "none"
    }
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: MAX,
      margin: "0 auto",
      padding: "18px var(--px)",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: "8px 20px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--muted)"
    }
  }, "\xA9 2026 Helmut"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: ".06em",
      color: "var(--muted-2)"
    }
  }, "Ohne Tracker \xB7 ohne Cookies"))));
}
function Site() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Header, null), /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(Problem, null), /*#__PURE__*/React.createElement(Delivers, null), /*#__PURE__*/React.createElement(BriefingShowcase, null), /*#__PURE__*/React.createElement(Areas, null), /*#__PURE__*/React.createElement(Who, null), /*#__PURE__*/React.createElement(Trust, null), /*#__PURE__*/React.createElement(Closing, null), /*#__PURE__*/React.createElement(Footer, null));
}
window.HelmutSite = {
  Site
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/site.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.PriorityItem = __ds_scope.PriorityItem;

__ds_ns.SectionHeading = __ds_scope.SectionHeading;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Wordmark = __ds_scope.Wordmark;

})();
