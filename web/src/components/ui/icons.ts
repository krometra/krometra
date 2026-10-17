export interface IconPath {
  d: string;
  fill?: boolean;
  dashed?: boolean;
  faded?: boolean;
}

const CUBE_OUTLINE = "M12 2.5 20.5 7.2v9.6L12 21.5 3.5 16.8V7.2z";
const CUBE_SPOKES = "M12 11.8 20.5 7.2 M12 11.8v9.7 M12 11.8 3.5 7.2";

export const ICONS = {
  plus: [{ d: "M12 5v14 M5 12h14" }],
  search: [{ d: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4" }],
  pencil: [{ d: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z M14.5 6.5 17.5 9.5" }],
  trash: [{ d: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" }],
  logout: [{ d: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10" }],
  grid: [{ d: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z" }],
  user: [{ d: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4.5 20a7.5 7.5 0 0 1 15 0" }],
  copy: [{ d: "M9 9h11v11H9z M5 15H4V4h11v1" }],
  arrowLeft: [{ d: "M19 12H5 M11 6l-6 6 6 6" }],
  keyboard: [
    { d: "M3 6h18v12H3z" },
    { d: "M7 10h.01 M11 10h.01 M15 10h.01 M17 10h.01 M7 14h10" },
  ],
  question: [{ d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.3-2.6 4 M12 17h.01" }],
  close: [{ d: "M6 6l12 12 M18 6 6 18" }],
  home: [{ d: "M12 3.5 3.5 10v10.5h6v-6h5v6h6V10z" }],
  fitAll: [{ d: "M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5 M9 9h6v6H9z" }],
  arrowRight: [{ d: "M5 12h14 M13 6l6 6-6 6" }],
  arrowUp: [{ d: "M12 19V5 M6 11l6-6 6 6" }],
  arrowDown: [{ d: "M12 5v14 M6 13l6 6 6-6" }],
  lightbulb: [
    { d: "M9.5 17h5 M10 20h4" },
    { d: "M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z" },
  ],
  // Режимы отображения — силуэт куба меняет заполнение и внутренние рёбра
  shaded: [{ d: CUBE_OUTLINE, fill: true }],
  shadedEdges: [{ d: CUBE_OUTLINE, fill: true }, { d: CUBE_SPOKES }],
  hiddenLine: [{ d: CUBE_OUTLINE }, { d: CUBE_SPOKES }],
  wireframe: [
    { d: "M3.5 8.5h11v11h-11z" },
    { d: "M9.5 4.5h11v11h-11z", faded: true },
    { d: "M3.5 8.5 9.5 4.5 M14.5 8.5l6-4 M14.5 19.5l6-4 M3.5 19.5l6-4", faded: true },
  ],
  section: [
    { d: CUBE_OUTLINE, faded: true },
    { d: "M2.5 12.5 12 8l9.5 4.5L12 17z", fill: true },
  ],
  lookAt: [
    { d: "M3.5 19.5h17 M6 16h12", faded: true },
    { d: "M12 3v9.5 M8.5 9 12 12.5 15.5 9" },
  ],
} satisfies Record<string, IconPath[]>;

export type IconName = keyof typeof ICONS;
