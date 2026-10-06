import { describe, expect, it } from "vitest";
import { contrastRatio } from "./color";
import { siteInfo } from "./siteInfo";

describe("siteInfo names", () => {
  it.each([
    ["youtube.com", "YouTube"],
    ["reddit.com", "Reddit"],
    ["news.ycombinator.com", "Hacker News"],
    ["github.com", "GitHub"],
  ])("knows %s as %s", (domain, name) => {
    expect(siteInfo(domain).name).toBe(name);
  });

  it("gives subdomains of a known site the same name", () => {
    expect(siteInfo("m.youtube.com").name).toBe("YouTube");
    expect(siteInfo("old.reddit.com").name).toBe("Reddit");
  });

  it("lets a specific entry beat its parent", () => {
    expect(siteInfo("mail.google.com").name).toBe("Gmail");
    expect(siteInfo("docs.google.com").name).toBe("Google Docs");
    expect(siteInfo("accounts.google.com").name).toBe("Google");
  });

  it("tidies an unknown domain into a name", () => {
    expect(siteInfo("example.com").name).toBe("Example");
    expect(siteInfo("blog.example.com").name).toBe("Example");
    expect(siteInfo("my-cool-site.io").name).toBe("My Cool Site");
  });

  it("understands two-level suffixes", () => {
    expect(siteInfo("shop.example.co.uk").name).toBe("Example");
    expect(siteInfo("example.com.au").name).toBe("Example");
  });

  it("shows addresses and local hosts as they are", () => {
    expect(siteInfo("192.168.1.10").name).toBe("192.168.1.10");
    expect(siteInfo("localhost").name).toBe("localhost");
  });

  it("copes with odd input", () => {
    expect(siteInfo("").name).toBe("");
    expect(siteInfo("").letter).toBe("?");
    expect(siteInfo("WWW.YouTube.com").name).toBe("YouTube");
  });
});

describe("siteInfo badge", () => {
  it("uses the first letter of the name", () => {
    expect(siteInfo("reddit.com").letter).toBe("R");
    expect(siteInfo("example.com").letter).toBe("E");
    expect(siteInfo("9gag.com").letter).toBe("9");
  });

  it("uses the brand colour for known sites and a stable colour for the rest", () => {
    expect(siteInfo("youtube.com").color).toBe("#ff0000");
    expect(siteInfo("example.com").color).toBe(siteInfo("blog.example.com").color);
    expect(siteInfo("example.com").color).toMatch(/^#[0-9a-f]{6}$/);
    expect(siteInfo("example.com").color).not.toBe(siteInfo("another.org").color);
  });

  it("always picks a letter colour that is readable on the badge", () => {
    const domains = ["youtube.com", "snapchat.com", "hulu.com", "github.com", "example.com", "a.org", "zebra.net", "quark.io", "hulu.com"];
    for (const domain of domains) {
      const { color, textColor } = siteInfo(domain);
      expect(contrastRatio(color, textColor), domain).toBeGreaterThanOrEqual(3);
    }
  });
});
