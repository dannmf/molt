import { describe, expect, it } from "vitest";

import { daysSince, formatBytes, formatRelativeDate } from "./format";

describe("formatBytes", () => {
  it("formata zero e negativos como 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-10)).toBe("0 B");
  });

  it("formata bytes puros sem decimais", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formata KB/MB/GB em base 1000, 1 decimal abaixo de 10", () => {
    expect(formatBytes(1_500)).toBe("1,5 KB");
    expect(formatBytes(1_600_000_000)).toBe("1,6 GB");
    expect(formatBytes(8_200_000_000)).toBe("8,2 GB");
  });

  it("formata sem decimais quando o valor já tem 2+ dígitos na unidade", () => {
    expect(formatBytes(125_000_000_000)).toBe("125 GB");
  });
});

describe("formatRelativeDate", () => {
  const now = 1_732_000_000;

  it("mostra 'agora' para instantes recentes", () => {
    expect(formatRelativeDate(now - 10, now)).toBe("agora");
  });

  it("mostra horas para o mesmo dia", () => {
    expect(formatRelativeDate(now - 3 * 60 * 60, now)).toBe("há 3 horas");
  });

  it("mostra 'ontem' para um dia atrás", () => {
    expect(formatRelativeDate(now - 1 * 24 * 60 * 60, now)).toBe("ontem");
  });

  it("mostra dias para menos de um mês", () => {
    expect(formatRelativeDate(now - 5 * 24 * 60 * 60, now)).toBe("há 5 dias");
  });

  it("mostra meses e anos para datas distantes", () => {
    expect(formatRelativeDate(now - 60 * 24 * 60 * 60, now)).toBe("há 2 meses");
    expect(formatRelativeDate(now - 400 * 24 * 60 * 60, now)).toBe("há 1 ano");
  });
});

describe("daysSince", () => {
  const now = 1_732_000_000;

  it("conta dias inteiros desde o timestamp", () => {
    expect(daysSince(now - 2.5 * 24 * 60 * 60, now)).toBe(2);
    expect(daysSince(now, now)).toBe(0);
  });
});
