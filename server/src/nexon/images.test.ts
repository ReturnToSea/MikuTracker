import { describe, expect, it } from "vitest";
import { avatarOf, fakeNexon, png } from "../../test/fixtures/nexon";
import { imageType, MAX_IMAGE_BYTES, PAUSE_MS } from "./client";
import { NexonError } from "./errors";

const failure = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e as NexonError);
const picture = (bytes: Uint8Array<ArrayBuffer>) => () => new Response(bytes, { status: 200 });

describe("imageType: what a picture is, from its first bytes", () => {
  it("knows PNG, GIF and JPEG", () => {
    expect(imageType(png("x"))).toBe("png");
    expect(imageType(new TextEncoder().encode("GIF89a…"))).toBe("gif");
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]))).toBe("jpg");
  });

  it("anything else (or too short to tell) is not a picture", () => {
    expect(imageType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // the start of a PNG header only
    expect(imageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(imageType(new Uint8Array([]))).toBeNull();
  });
});

describe("downloading an avatar", () => {
  it("gives the picture and its type", async () => {
    const nexon = fakeNexon();
    const image = await nexon.client.downloadImage(avatarOf("MikuBeam"));
    expect(image.type).toBe("png");
    expect(image.bytes).toEqual(png(avatarOf("MikuBeam")));
    expect(nexon.requests[0]!.init.headers).toEqual({ Accept: "image/*" });
  });

  it("only from Nexon's own https image servers, without even asking elsewhere", async () => {
    const nexon = fakeNexon();
    for (const url of ["https://evil.com/a.png", "http://msavatar1.nexon.net/a.png"]) {
      const err = await failure(nexon.client.downloadImage(url));
      expect([err?.kind, err?.message]).toEqual(["changed", "Avatars are only downloaded from Nexon's own image servers."]);
    }
    expect(nexon.requests).toHaveLength(0);
  });

  it("refuses something that isn't a picture, or is far too big", async () => {
    const notPicture = fakeNexon(picture(new TextEncoder().encode("<html>maintenance</html>")));
    expect((await failure(notPicture.client.downloadImage(avatarOf("A"))))?.message).toBe("Nexon's avatar wasn't a picture we expected.");
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(png("x"));
    expect((await failure(fakeNexon(picture(huge)).client.downloadImage(avatarOf("A"))))?.kind).toBe("changed");
    const justFits = new Uint8Array(MAX_IMAGE_BYTES);
    justFits.set(png("x"));
    expect((await fakeNexon(picture(justFits)).client.downloadImage(avatarOf("A"))).bytes).toHaveLength(MAX_IMAGE_BYTES);
  });

  it("is retried when Nexon can't be reached, and waits its turn like every request", async () => {
    const nexon = fakeNexon((url, call) => (call === 1 ? new Response("", { status: 503 }) : picture(png("ok"))()));
    expect((await nexon.client.downloadImage(avatarOf("A"))).bytes).toEqual(png("ok"));
    expect(nexon.requests).toHaveLength(2);
    expect(nexon.requests[1]!.at - nexon.requests[0]!.at).toBeGreaterThanOrEqual(PAUSE_MS);
  });
});
