import { useI18n } from "@/composables/shared/useI18n";

const NOUNS = {
  "точки и отрезка": "sketchDetail.noun0",
  "точки и кривой": "sketchDetail.noun1",
  "двух отрезков": "sketchDetail.noun2",
  "одного объекта": "sketchDetail.noun3",
  "одного или двух объектов": "sketchDetail.noun4",
} as const;

const KEYS = {
  "Укажите базовую линию": "sketchDetail.m0",
  "Укажите точку": "sketchDetail.m1",
  "Радиус скругления": "sketchDetail.m2",
  "Отступ, мм": "sketchDetail.m3",
  "Ограничение": "sketchDetail.m4",
  "Удалить (Del)": "sketchDetail.m5",
  "Снять выбор": "sketchDetail.m6",
  "Кликните участок кривой: он удалится до ближайших пересечений": "sketchDetail.m7",
  "Сделать вспомогательной": "sketchDetail.m8",
  "Сделать обычной": "sketchDetail.m9",
  "Укажите второй отрезок": "sketchDetail.m10",
  "Кликните угол или два отрезка, затем введите радиус": "sketchDetail.m11",
  "Кликните угол или два отрезка, затем введите отступ": "sketchDetail.m12",
  "Дуга по 3 точкам: укажите начало": "sketchDetail.m13",
  "Укажите конец дуги": "sketchDetail.m14",
  "Укажите точку на дуге": "sketchDetail.m15",
  "Точки на одной прямой: дугу не построить": "sketchDetail.m16",
  "Гориз.": "sketchDetail.m17",
  "Верт.": "sketchDetail.m18",
  "Совпад.": "sketchDetail.m19",
  "Паралл.": "sketchDetail.m20",
  "Перпенд.": "sketchDetail.m21",
  "Равно": "sketchDetail.m22",
  "Коллин.": "sketchDetail.m23",
  "Середина": "sketchDetail.m24",
  "На кривой": "sketchDetail.m25",
  "Касательная": "sketchDetail.m26",
  "Фаска": "sketchDetail.m27",
  "Фиксация": "sketchDetail.m28",
  "Расст.": "sketchDetail.m29",
  "Радиус": "sketchDetail.m30",
  "Длина": "sketchDetail.m31",
  "Диаметр": "sketchDetail.m32",
  "Расст. между": "sketchDetail.m33",
  "До линии": "sketchDetail.m34",
  "По гориз.": "sketchDetail.m35",
  "По верт.": "sketchDetail.m36",
  "Гор": "sketchDetail.m37",
  "Вер": "sketchDetail.m38",
  "Совп": "sketchDetail.m39",
  "Колл": "sketchDetail.m40",
  "Сер": "sketchDetail.m41",
  "На кр": "sketchDetail.m42",
  "Фикс": "sketchDetail.m43",
  "Горизонтальность — выберите отрезки или две точки": "sketchDetail.m44",
  "Вертикальность — выберите отрезки или две точки": "sketchDetail.m45",
  "Совпадение — выберите две точки или больше: концы, середины, центры, начало координат": "sketchDetail.m46",
  "Параллельность — выберите два отрезка или больше": "sketchDetail.m47",
  "Перпендикулярность — выберите два отрезка": "sketchDetail.m48",
  "Равенство — выберите отрезки или окружности и дуги": "sketchDetail.m49",
  "Коллинеарность — выберите два отрезка или больше: они встанут на одну прямую": "sketchDetail.m50",
  "Середина — точку и отрезок; для окружности её центр, для двух отрезков начало первого": "sketchDetail.m51",
  "Точка на кривой — первым точку (у отрезка начало, у окружности центр), вторым отрезок, окружность или дугу": "sketchDetail.m52",
  "Зафиксировать — выбранные объекты целиком или точки останутся на месте": "sketchDetail.m53",
  "Размер (D) — длина отрезка, расстояние между параллельными, угол, диаметр": "sketchDetail.m54",
  "Радиус — выберите окружность или дугу": "sketchDetail.m55",
  "Угол — выберите два отрезка": "sketchDetail.m56",
  "Расстояние": "sketchDetail.m57",
  "Расстояние по горизонтали": "sketchDetail.m58",
  "Расстояние по вертикали": "sketchDetail.m59",
  "Расстояние между отрезками": "sketchDetail.m60",
  "Расстояние от точки до линии": "sketchDetail.m61",
  "Отступ фаски": "sketchDetail.m62",
  "Угол должен быть меньше 360°": "sketchDetail.m63",
  "Расстояние не может быть отрицательным": "sketchDetail.m64",
  "значение должно быть больше нуля": "sketchDetail.m65",
  "Конец": "sketchDetail.m66",
  "Центр": "sketchDetail.m67",
  "Центр контура": "sketchDetail.m68",
  "Начало координат": "sketchDetail.m69",
  "Пересечение": "sketchDetail.m70",
  "Квадрант": "sketchDetail.m71",
  "Перпендикуляр": "sketchDetail.m72",
  "На линии": "sketchDetail.m73",
  "Сетка": "sketchDetail.m74",
  "Угол": "sketchDetail.m75",
  "Скругление": "sketchDetail.m76",
  "это тот же отрезок": "sketchDetail.m77",
  "отрезок нулевой длины": "sketchDetail.m78",
  "точка лежит на этом же отрезке": "sketchDetail.m79",
  "точка лежит на прямой": "sketchDetail.m80",
  "это та же точка": "sketchDetail.m81",
  "точки совпадают": "sketchDetail.m82",
  "Выберите второй объект: точку или отрезок": "sketchDetail.m83",
  "Выберите вторую точку или отрезок": "sketchDetail.m84",
  "Размер: выберите отрезок, окружность, дугу или точку": "sketchDetail.m85",
  "выделение устарело или объект не участвует в ограничениях": "sketchDetail.m86",
  "выберите два объекта или больше": "sketchDetail.m87",
  "только отрезки и прямые": "sketchDetail.m88",
  "точку с кривой связывает «На кр» (точка на кривой)": "sketchDetail.m89",
  "только точки: концы, середины, центры, начало координат": "sketchDetail.m90",
  "только отрезки или только окружности и дуги": "sketchDetail.m91",
  "только отрезки или две точки": "sketchDetail.m92",
  "вторым нужен отрезок, первым точка, отрезок или окружность": "sketchDetail.m93",
  "нужен отрезок": "sketchDetail.m94",
  "точка и отрезок должны быть разными объектами": "sketchDetail.m95",
  "первой нужна точка, отрезок или окружность": "sketchDetail.m96",
  "второй нужна кривая: отрезок, прямая, окружность или дуга": "sketchDetail.m97",
  "точка и кривая должны быть разными объектами": "sketchDetail.m98",
  "закрепляются точки, отрезки, окружности и дуги": "sketchDetail.m99",
  "ничего не выбрано": "sketchDetail.m100",
  "нужна окружность или дуга": "sketchDetail.m101",
  "неизвестное ограничение": "sketchDetail.m102",
  "Нужны два разных отрезка": "sketchDetail.m103",
  "Отступ должен быть больше нуля": "sketchDetail.m104",
  "Отрезки параллельны": "sketchDetail.m105",
  "Отрезок нулевой длины": "sketchDetail.m106",
  "Отступ слишком большой для этих отрезков": "sketchDetail.m107",
  "Радиус должен быть больше нуля": "sketchDetail.m108",
  "Отрезки лежат на одной прямой": "sketchDetail.m109",
  "Радиус слишком большой для этих отрезков": "sketchDetail.m110",
  "Ш": "sketchDetail.m111",
  "В": "sketchDetail.m112"
} as const;

export function useSketchText() {
  const { t } = useI18n();
  function translate(text: string): string {
    const key = KEYS[text as keyof typeof KEYS];
    if (key) return t(key);
    const noun = NOUNS[text as keyof typeof NOUNS];
    if (noun) return t(noun);
    let match = text.match(/^Отступ (.+) мм — кликните сторону$/);
    if (match) return t("sketchDetail.offset", { distance: match[1] });
    match = text.match(/^Размер недоступен: (.+)$/);
    if (match) return t("sketchDetail.invalid", { reason: translate(match[1]) });
    match = text.match(/^(.+) — кликните, чтобы поставить размер$/);
    if (match) {
      const dimension = match[1].match(/^(.+) ([^ ]+)$/);
      return t("sketchDetail.place", { text: dimension ? `${translate(dimension[1])} ${dimension[2]}` : match[1] });
    }
    match = text.match(/^(.+) \(недоступно: (.+)\)$/);
    if (match) return t("sketchDetail.disabled", { hint: translate(match[1]), reason: translate(match[2]) });
    match = text.match(/^(.+): значение должно быть больше нуля$/);
    if (match) return t("sketchDetail.positive", { name: translate(match[1]) });
    match = text.match(/^только для (.+), выбрано (\d+)$/);
    if (match) return t("sketchDetail.only", { objects: translate(match[1]), count: match[2] });
    match = text.match(/^только для одного или двух объектов, выбрано (\d+)$/);
    if (match) return t("sketchDetail.tooMany", { count: match[1] });
    const dimension = text.match(/^(.+) ([^ ]+)$/);
    if (dimension && KEYS[dimension[1] as keyof typeof KEYS]) return `${translate(dimension[1])} ${dimension[2]}`;
    return text;
  }
  return translate;
}
