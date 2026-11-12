// Адаптивный поиск вкусов: русский ↔ английский.
// peanut = арахис, ananas = ананас, раскладка и транслит тоже работают.

const FRUIT_DICT: Record<string, string[]> = {
  арахис: ["peanut"], ананас: ["ananas", "pineapple"], яблоко: ["apple"], груша: ["pear"],
  персик: ["peach"], абрикос: ["apricot"], вишня: ["cherry"], черешня: ["sweet cherry"],
  клубника: ["strawberry"], малина: ["raspberry"], черника: ["blueberry"], ежевика: ["blackberry"],
  смородина: ["currant", "blackcurrant"], крыжовник: ["gooseberry"], виноград: ["grape"],
  арбуз: ["watermelon"], дыня: ["melon"], манго: ["mango"], банан: ["banana"], киви: ["kiwi"],
  лимон: ["lemon"], лайм: ["lime"], апельсин: ["orange"], мандарин: ["tangerine", "mandarin"],
  грейпфрут: ["grapefruit"], маракуйя: ["passion fruit", "maracuja"], гуава: ["guava"],
  папайя: ["papaya"], кокос: ["coconut"], гранат: ["pomegranate"], слива: ["plum"],
  мята: ["mint"], мёд: ["honey"], мед: ["honey"], ваниль: ["vanilla"],
  шоколад: ["chocolate"], кофе: ["coffee"], чай: ["tea"], сливки: ["cream"], молоко: ["milk"],
  карамель: ["caramel"], корица: ["cinnamon"], имбирь: ["ginger"], лёд: ["ice"], лед: ["ice"],
  кола: ["cola"], энергетик: ["energy"], жвачка: ["gum", "bubble gum"], мороженое: ["ice cream"],
  печенье: ["cookie"], орех: ["nut", "hazelnut"], фундук: ["hazelnut"], миндаль: ["almond"],
  фисташка: ["pistachio"], роза: ["rose"], жасмин: ["jasmine"], лаванда: ["lavender"],
  базилик: ["basil"], тархун: ["tarragon"], дюшес: ["duchess"], облепиха: ["sea buckthorn"],
  клюква: ["cranberry"], брусника: ["lingonberry"], тропический: ["tropical"], ягоды: ["berry", "berries"],
  лесные: ["forest"], цитрус: ["citrus"], кислый: ["sour"], сладкий: ["sweet"], свежий: ["fresh"],
  лимонад: ["lemonade"], тоник: ["tonic"], мартини: ["martini"], мохито: ["mojito"],
  огурец: ["cucumber"], томат: ["tomato"], перец: ["pepper"], табак: ["tobacco"],
};

const TR: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",
  о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",
  э:"e",ю:"yu",я:"ya",
};
const LAYOUT_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const LAYOUT_RU = "йцукенгшщзхъфывапролджэячсмитьбю";

export function translit(s: string): string {
  return s.toLowerCase().split("").map((c) => (c in TR ? TR[c] : c)).join("");
}
function fixLayout(s: string): string {
  return s.toLowerCase().split("").map((c) => {
    const i = LAYOUT_EN.indexOf(c);
    return i >= 0 ? LAYOUT_RU[i] : c;
  }).join("");
}
function norm(s: string) {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Все варианты написания запроса, по которым ищем. */
export function expandQuery(query: string): string[] {
  const base = norm(query);
  if (!base) return [];
  const out = new Set<string>([base, norm(translit(base)), norm(fixLayout(base))]);
  for (const v of [...out]) {
    for (const [ru, ens] of Object.entries(FRUIT_DICT)) {
      const r = norm(ru);
      if (r.startsWith(v) || v.startsWith(r)) ens.forEach((e) => out.add(norm(e)));
      for (const e of ens) {
        const en = norm(e);
        if (en.startsWith(v) || (v.length >= 3 && v.startsWith(en))) { out.add(r); out.add(en); }
      }
    }
  }
  return [...out].filter(Boolean);
}

export function flavorMatches(brand: string, name: string, query: string): boolean {
  const variants = expandQuery(query);
  if (!variants.length) return true;
  const hay = [norm(brand), norm(name), norm(translit(name)), norm(translit(brand))].join(" | ");
  return variants.some((v) => hay.includes(v));
}
