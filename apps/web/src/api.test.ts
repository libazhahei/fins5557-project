import { beforeEach, describe, expect, it } from "vitest";
import { getToken, setToken } from "./api";

describe("token helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and clears token", () => {
    expect(getToken()).toBeNull();
    setToken("abc");
    expect(getToken()).toBe("abc");
    setToken(null);
    expect(getToken()).toBeNull();
  });
});
