export type PluralCategory = Intl.LDMLPluralRule;

export type PluralForms = Readonly<Partial<Record<PluralCategory, string>> & { other: string }>;

export type Message = string | PluralForms;

export type Dictionary = Readonly<Record<string, Message>>;

export type MessageValues = Readonly<Record<string, string | number>>;

export type DomainMessages<Domain extends string> = Readonly<Record<`${Domain}.${string}`, Message>>;

export type Translation<Source extends Dictionary> = {
  readonly [Key in keyof Source]: Source[Key] extends string ? string : PluralForms;
};

type PlaceholderName<Template extends string> =
  Template extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholderName<Rest> : never;

type PluralValues<Forms extends PluralForms> = { readonly count: number } & Readonly<
  Record<Exclude<PlaceholderName<Extract<Forms[keyof Forms], string>>, "count">, string | number>
>;

export type MessageArgs<M extends Message> = M extends string
  ? [PlaceholderName<M>] extends [never]
    ? []
    : [values: Readonly<Record<PlaceholderName<M>, string | number>>]
  : M extends PluralForms
    ? [values: PluralValues<M>]
    : never;

const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholderNames(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]))];
}

export function interpolate(template: string, values: MessageValues = {}): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

const pluralRules = new Map<string, Intl.PluralRules>();

function pluralRulesFor(locale: string): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules;
}

export function pluralCategories(locale: string): PluralCategory[] {
  return pluralRulesFor(locale).resolvedOptions().pluralCategories;
}

export function selectPluralForm(locale: string, forms: PluralForms, count: number): string {
  return forms[pluralRulesFor(locale).select(count)] ?? forms.other;
}

export function renderMessage(locale: string, message: Message, values: MessageValues = {}): string {
  const template =
    typeof message === "string" ? message : selectPluralForm(locale, message, Number(values["count"]));
  return interpolate(template, values);
}
