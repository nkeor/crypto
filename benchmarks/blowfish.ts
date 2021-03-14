import { bench, runBenchmarks } from "../dev_deps.ts";
import {
  BlowfishCbc,
  BlowfishCfb,
  BlowfishEcb,
  BlowfishOfb,
} from "../src/blowfish/mod.ts";
import { args } from "./utils/benchmarkArgs.ts";

const { runs: _runs, ...opts } = args;
const runs = _runs || 25;

const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const iv = new Uint8Array(8);
const data = new Uint8Array(1024 * 1024 * 2);

bench({
  name: "Blowfish-ECB 2MiB Encrypt",
  runs,
  func(b) {
    const cipher = new BlowfishEcb(key);
    b.start();
    cipher.encrypt(data);
    b.stop();
  },
});

bench({
  name: "Blowfish-ECB 2MiB Decrypt",
  runs,
  func(b) {
    const cipher = new BlowfishEcb(key);
    b.start();
    cipher.decrypt(data);
    b.stop();
  },
});

bench({
  name: "Blowfish-CBC 2MiB Encrypt",
  runs,
  func(b) {
    const cipher = new BlowfishCbc(key, iv);

    b.start();
    cipher.encrypt(data);
    b.stop();
  },
});

bench({
  name: "Blowfish-CBC 2MiB Decrypt",
  runs,
  func(b) {
    const bf = new BlowfishCbc(key, iv);
    b.start();
    bf.decrypt(data);
    b.stop();
  },
});

bench({
  name: "Blowfish-CFB 2MiB Encrypt",
  runs,
  func(b) {
    const cipher = new BlowfishCfb(key, iv);

    b.start();
    cipher.encrypt(data);
    b.stop();
  },
});

bench({
  name: "Blowfish-CFB 2MiB Decrypt",
  runs,
  func(b) {
    const bf = new BlowfishCfb(key, iv);
    b.start();
    bf.decrypt(data);
    b.stop();
  },
});

bench({
  // Encryption and decryption are the same
  name: "Blowfish-OFB 2MiB Encrypt/Decrypt",
  runs,
  func(b) {
    const cipher = new BlowfishOfb(key, iv);

    b.start();
    cipher.encrypt(data);
    b.stop();
  },
});

if (import.meta.main) {
  runBenchmarks(opts);
}
