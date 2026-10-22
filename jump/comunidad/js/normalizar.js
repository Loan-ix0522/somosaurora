// Normaliza lo que escribe el equipo o el emprendedor antes de guardarlo. Lo usan la página y la API (mismo archivo).

// WhatsApp de Ecuador → 09XXXXXXXX (acepta +593, espacios, guiones y paréntesis). null si no es un celular.
export function whatsapp(s) {
  let d = String(s ?? "").replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (d.startsWith("593")) d = "0" + d.slice(3);
  return /^09\d{8}$/.test(d) ? d : null;
}

// Recorta, colapsa espacios repetidos en cada línea y corta en `max` caracteres.
export function texto(s, max) {
  const limpio = String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [...limpio].slice(0, max).join("");
}

// Nombre de persona: 2–80 caracteres. null si no cumple.
export function nombre(s) {
  const n = texto(s, 200).replace(/\s+/g, " ");
  return n.length >= 2 && n.length <= 80 ? n : null;
}
