# Third-party notices

This file is generated from the locked npm, Cargo, and Python dependency graphs. It is
an inventory, not a substitute for the license texts shipped by each package.
The source distribution retains dependency license files through the normal
package, Cargo, and Python registries.

- Snapshot SHA-256: `ea92df7c097cafcb06c5cea497b3d6782905ffc29ef1cc8d9e0f557b96f2f94d`
- Components: 1236
- AKShare sidecar lock SHA-256: `98f766385e00fa5bd8d5f0c0e8ed7e5eae13f83f003e45554a4b1880bd38c7b8`
- FinanceDataReader sidecar lock SHA-256: `2683a9389e744f96445559509abb0981e661a6a1f4b7b367d0f3544c96178aee`
- Python sidecar builds: CPython 3.11.15, uv 0.11.8
- Audit rule: missing, proprietary, unlicensed, `SEE LICENSE`, and
  `LicenseRef` declarations fail generation.

## Optional local market-data connector software

These are software licenses for the connector code. They do not grant rights to
market data returned by a third-party provider.

| Connector software | Version | Software license | Project |
| --- | --- | --- | --- |
| AKTools | 0.0.91 | MIT | [Project](https://github.com/akfamily/aktools) |
| AKShare | 1.18.91 | MIT | [Project](https://github.com/akfamily/akshare) |
| CCXT | 4.5.73 | MIT | [Project](https://github.com/ccxt/ccxt) |
| FinanceDataReader | 0.9.202 | MIT | [Project](https://github.com/FinanceData/FinanceDataReader) |

## Market-data provider terms (not software licenses)

The links below govern access to the actual data source. They are intentionally
kept outside the software-license inventory and CycloneDX license fields. A UI
acknowledgement records that the reminder was shown; it is not a data license or
authorization from the provider.

| Data provider | Reviewed terms revision | Terms |
| --- | --- | --- |
| Eastmoney | eastmoney-terms-2025-07-18 | [Terms](https://about.eastmoney.com/home/protocol) |
| Tencent Finance | tencent-terms-reviewed-2026-08-15 | [Terms](https://www.tencent.com/term-of-service/) |
| Sina Finance | sina-finance-terms-reviewed-2026-08-15 | [Terms](https://finance.sina.com.cn/roll/2021-05-12/doc-ikmxzfmm2033220.shtml) |
| Binance | binance-terms-reviewed-2026-07-19 | [Terms](https://www.binance.com/en/terms) |
| OKX | okx-terms-2026-04-21 | [Terms](https://www.okx.com/help/terms-of-service) |
| Yahoo Finance | finance-datareader-upstream-review-2026-08-14 | [Terms](https://finance.yahoo.com/legal/terms.html) |
| Naver Finance | finance-datareader-upstream-review-2026-08-14 | [Terms](https://policy.naver.com/rules/service.html) |
| Investing.com | finance-datareader-upstream-review-2026-08-14 | [Terms](https://www.investing.com/about-us/terms-and-conditions) |

## Dependency inventory

| Ecosystem | Package | Version | Audited SPDX license | Review evidence | Role |
| --- | --- | --- | --- | --- | --- |
| build-tool | uv | 0.11.8 | Apache-2.0 OR MIT | uv 0.11.8 source licenses: https://github.com/astral-sh/uv/tree/0.11.8 | reproducible-build-tool |
| cargo | adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |  | runtime |
| cargo | ahash | 0.7.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | ahash | 0.8.12 | MIT OR Apache-2.0 |  | runtime |
| cargo | aho-corasick | 1.1.4 | Unlicense OR MIT |  | runtime |
| cargo | alloc-no-stdlib | 2.0.4 | BSD-3-Clause |  | runtime |
| cargo | alloc-stdlib | 0.2.2 | BSD-3-Clause |  | runtime |
| cargo | android_system_properties | 0.1.5 | MIT/Apache-2.0 |  | runtime |
| cargo | anstyle | 1.0.14 | MIT OR Apache-2.0 |  | runtime |
| cargo | anyhow | 1.0.104 | MIT OR Apache-2.0 |  | runtime |
| cargo | arbitrary | 1.4.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | arrayvec | 0.7.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | arrow-arith | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-array | 58.3.0 | Apache-2.0 AND MIT |  | runtime |
| cargo | arrow-buffer | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-cast | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-data | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-ord | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-row | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-schema | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-select | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow-string | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | arrow | 58.3.0 | Apache-2.0 |  | runtime |
| cargo | assert_cmd | 2.2.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | async-broadcast | 0.7.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | async-channel | 2.5.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-executor | 1.14.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-io | 2.6.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-lock | 3.4.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-process | 2.5.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-recursion | 1.1.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | async-signal | 0.2.13 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-task | 4.7.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | async-trait | 0.1.89 | MIT OR Apache-2.0 |  | runtime |
| cargo | atk-sys | 0.18.2 | MIT |  | runtime |
| cargo | atk | 0.18.2 | MIT |  | runtime |
| cargo | atoi | 2.0.0 | MIT |  | runtime |
| cargo | atomic-waker | 1.1.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | autocfg | 1.5.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | autocfg | 1.5.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | base64 | 0.21.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | base64 | 0.22.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | bit-set | 0.8.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | bit-vec | 0.8.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | bitflags | 1.3.2 | MIT/Apache-2.0 |  | runtime |
| cargo | bitflags | 2.11.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | bitflags | 2.13.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | bitvec | 1.0.1 | MIT |  | runtime |
| cargo | block-buffer | 0.10.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | block2 | 0.6.2 | MIT |  | runtime |
| cargo | blocking | 1.6.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | borsh-derive | 1.6.1 | Apache-2.0 |  | runtime |
| cargo | borsh | 1.6.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | brotli-decompressor | 5.0.0 | BSD-3-Clause/MIT |  | runtime |
| cargo | brotli | 8.0.2 | BSD-3-Clause AND MIT |  | runtime |
| cargo | bs58 | 0.5.1 | MIT/Apache-2.0 |  | runtime |
| cargo | bstr | 1.12.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | bumpalo | 3.20.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | bumpalo | 3.20.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | bytecheck_derive | 0.6.12 | MIT |  | runtime |
| cargo | bytecheck | 0.6.12 | MIT |  | runtime |
| cargo | bytemuck | 1.25.0 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | byteorder-lite | 0.1.0 | Unlicense OR MIT |  | runtime |
| cargo | byteorder | 1.5.0 | Unlicense OR MIT |  | runtime |
| cargo | bytes | 1.11.1 | MIT |  | runtime |
| cargo | cairo-rs | 0.18.5 | MIT |  | runtime |
| cargo | cairo-sys-rs | 0.18.2 | MIT |  | runtime |
| cargo | camino | 1.2.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | cargo_metadata | 0.19.2 | MIT |  | runtime |
| cargo | cargo_toml | 0.22.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | cargo-platform | 0.1.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | cast | 0.3.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | cc | 1.2.56 | MIT OR Apache-2.0 |  | runtime |
| cargo | cc | 1.2.63 | MIT OR Apache-2.0 |  | runtime |
| cargo | cesu8 | 1.1.0 | Apache-2.0/MIT |  | runtime |
| cargo | cfb | 0.7.3 | MIT |  | runtime |
| cargo | cfg_aliases | 0.2.1 | MIT |  | runtime |
| cargo | cfg-expr | 0.15.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | cfg-if | 1.0.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | chrono | 0.4.44 | MIT OR Apache-2.0 |  | runtime |
| cargo | chrono | 0.4.45 | MIT OR Apache-2.0 |  | runtime |
| cargo | combine | 4.6.7 | MIT |  | runtime |
| cargo | comfy-table | 7.1.4 | MIT |  | runtime |
| cargo | concurrent-queue | 2.5.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | const-random-macro | 0.1.16 | MIT OR Apache-2.0 |  | runtime |
| cargo | const-random | 0.1.18 | MIT OR Apache-2.0 |  | runtime |
| cargo | cookie | 0.18.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | core-foundation | 0.10.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | core-graphics-types | 0.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | core-graphics | 0.25.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | cpufeatures | 0.2.17 | MIT OR Apache-2.0 |  | runtime |
| cargo | crc32fast | 1.5.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | crossbeam-channel | 0.5.15 | MIT OR Apache-2.0 |  | runtime |
| cargo | crossbeam-deque | 0.8.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | crossbeam-epoch | 0.9.20 | MIT OR Apache-2.0 |  | runtime |
| cargo | crossbeam-utils | 0.8.21 | MIT OR Apache-2.0 |  | runtime |
| cargo | crossterm_winapi | 0.9.1 | MIT |  | runtime |
| cargo | crossterm | 0.28.1 | MIT |  | runtime |
| cargo | crunchy | 0.2.4 | MIT |  | runtime |
| cargo | crypto-common | 0.1.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | cssparser-macros | 0.6.1 | MPL-2.0 |  | runtime |
| cargo | cssparser | 0.36.0 | MPL-2.0 |  | runtime |
| cargo | ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT |  | runtime |
| cargo | ctor | 0.8.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | darling_core | 0.23.0 | MIT |  | runtime |
| cargo | darling_macro | 0.23.0 | MIT |  | runtime |
| cargo | darling | 0.23.0 | MIT |  | runtime |
| cargo | dbus | 0.9.12 | Apache-2.0/MIT |  | runtime |
| cargo | deranged | 0.5.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | derive_arbitrary | 1.4.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | derive_more-impl | 2.1.1 | MIT |  | runtime |
| cargo | derive_more | 2.1.1 | MIT |  | runtime |
| cargo | difflib | 0.4.0 | MIT |  | runtime |
| cargo | digest | 0.10.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | dirs-sys | 0.5.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | dirs | 6.0.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | displaydoc | 0.2.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | displaydoc | 0.2.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | dlopen2_derive | 0.4.3 | MIT |  | runtime |
| cargo | dlopen2 | 0.8.2 | MIT |  | runtime |
| cargo | dom_query | 0.27.0 | MIT |  | runtime |
| cargo | dpi | 0.1.2 | Apache-2.0 AND MIT |  | runtime |
| cargo | dtoa-short | 0.3.5 | MPL-2.0 |  | runtime |
| cargo | dtoa | 1.0.11 | MIT OR Apache-2.0 |  | runtime |
| cargo | dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT |  | runtime |
| cargo | dtor | 0.3.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | duckdb | 1.10503.1 | MIT |  | runtime |
| cargo | dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 |  | runtime |
| cargo | dyn-clone | 1.0.20 | MIT OR Apache-2.0 |  | runtime |
| cargo | either | 1.16.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | embed_plist | 1.2.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | embed-resource | 3.0.6 | MIT |  | runtime |
| cargo | endi | 1.1.1 | MIT |  | runtime |
| cargo | enumflags2_derive | 0.7.12 | MIT OR Apache-2.0 |  | runtime |
| cargo | enumflags2 | 0.7.12 | MIT OR Apache-2.0 |  | runtime |
| cargo | equivalent | 1.0.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | erased-serde | 0.4.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | errno | 0.3.14 | MIT OR Apache-2.0 |  | runtime |
| cargo | event-listener-strategy | 0.5.4 | Apache-2.0 OR MIT |  | runtime |
| cargo | event-listener | 5.4.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | fallible-iterator | 0.3.0 | MIT/Apache-2.0 |  | runtime |
| cargo | fallible-streaming-iterator | 0.1.9 | MIT/Apache-2.0 |  | runtime |
| cargo | fastrand | 2.3.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | fastrand | 2.4.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | fdeflate | 0.3.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | field-offset | 0.3.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | filetime | 0.2.29 | MIT/Apache-2.0 |  | runtime |
| cargo | find-msvc-tools | 0.1.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | flate2 | 1.1.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | fnv | 1.0.7 | Apache-2.0 / MIT |  | runtime |
| cargo | foldhash | 0.1.5 | Zlib |  | runtime |
| cargo | foldhash | 0.2.0 | Zlib |  | runtime |
| cargo | foreign-types-macros | 0.2.3 | MIT/Apache-2.0 |  | runtime |
| cargo | foreign-types-shared | 0.3.1 | MIT/Apache-2.0 |  | runtime |
| cargo | foreign-types | 0.5.0 | MIT/Apache-2.0 |  | runtime |
| cargo | form_urlencoded | 1.2.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | funty | 2.0.0 | MIT |  | runtime |
| cargo | futures-channel | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-core | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-executor | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-io | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-lite | 2.6.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | futures-macro | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-sink | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-task | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | futures-util | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | gdk-pixbuf-sys | 0.18.0 | MIT |  | runtime |
| cargo | gdk-pixbuf | 0.18.5 | MIT |  | runtime |
| cargo | gdk-sys | 0.18.2 | MIT |  | runtime |
| cargo | gdk | 0.18.2 | MIT |  | runtime |
| cargo | gdkwayland-sys | 0.18.2 | MIT |  | runtime |
| cargo | gdkx11-sys | 0.18.2 | MIT |  | runtime |
| cargo | gdkx11 | 0.18.2 | MIT |  | runtime |
| cargo | generic-array | 0.14.7 | MIT |  | runtime |
| cargo | getrandom | 0.2.17 | MIT OR Apache-2.0 |  | runtime |
| cargo | getrandom | 0.3.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | getrandom | 0.4.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | getrandom | 0.4.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | gio-sys | 0.18.1 | MIT |  | runtime |
| cargo | gio | 0.18.4 | MIT |  | runtime |
| cargo | glib-macros | 0.18.5 | MIT |  | runtime |
| cargo | glib-sys | 0.18.1 | MIT |  | runtime |
| cargo | glib | 0.18.5 | MIT |  | runtime |
| cargo | glob | 0.3.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | gobject-sys | 0.18.0 | MIT |  | runtime |
| cargo | gtk-sys | 0.18.2 | MIT |  | runtime |
| cargo | gtk | 0.18.2 | MIT |  | runtime |
| cargo | gtk3-macros | 0.18.2 | MIT |  | runtime |
| cargo | half | 2.7.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | hashbrown | 0.12.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | hashbrown | 0.15.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | hashbrown | 0.16.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | hashbrown | 0.17.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | hashlink | 0.10.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | heck | 0.4.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | heck | 0.5.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | hermit-abi | 0.5.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | hex | 0.4.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | html5ever | 0.38.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | http-body-util | 0.1.3 | MIT |  | runtime |
| cargo | http-body | 1.0.1 | MIT |  | runtime |
| cargo | http | 1.4.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | http | 1.4.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | httparse | 1.10.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | hyper-rustls | 0.27.9 | Apache-2.0 OR ISC OR MIT |  | runtime |
| cargo | hyper-util | 0.1.20 | MIT |  | runtime |
| cargo | hyper | 1.10.1 | MIT |  | runtime |
| cargo | hyper | 1.8.1 | MIT |  | runtime |
| cargo | iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | iana-time-zone | 0.1.65 | MIT OR Apache-2.0 |  | runtime |
| cargo | ico | 0.5.0 | MIT |  | runtime |
| cargo | icu_collections | 2.1.1 | Unicode-3.0 |  | runtime |
| cargo | icu_collections | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | icu_locale_core | 2.1.1 | Unicode-3.0 |  | runtime |
| cargo | icu_locale_core | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | icu_normalizer_data | 2.1.1 | Unicode-3.0 |  | runtime |
| cargo | icu_normalizer_data | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | icu_normalizer | 2.1.1 | Unicode-3.0 |  | runtime |
| cargo | icu_normalizer | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | icu_properties_data | 2.1.2 | Unicode-3.0 |  | runtime |
| cargo | icu_properties_data | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | icu_properties | 2.1.2 | Unicode-3.0 |  | runtime |
| cargo | icu_properties | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | icu_provider | 2.1.1 | Unicode-3.0 |  | runtime |
| cargo | icu_provider | 2.2.0 | Unicode-3.0 |  | runtime |
| cargo | id-arena | 2.3.0 | MIT/Apache-2.0 |  | runtime |
| cargo | ident_case | 1.0.1 | MIT/Apache-2.0 |  | runtime |
| cargo | idna_adapter | 1.2.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | idna_adapter | 1.2.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | idna | 1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | image | 0.25.10 | MIT OR Apache-2.0 |  | runtime |
| cargo | indexmap | 1.9.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | indexmap | 2.13.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | indexmap | 2.14.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | infer | 0.19.0 | MIT |  | runtime |
| cargo | ipnet | 2.11.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | ipnet | 2.12.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | iri-string | 0.7.10 | MIT OR Apache-2.0 |  | runtime |
| cargo | is-docker | 0.2.0 | MIT |  | runtime |
| cargo | is-wsl | 0.4.0 | MIT |  | runtime |
| cargo | itoa | 1.0.17 | MIT OR Apache-2.0 |  | runtime |
| cargo | itoa | 1.0.18 | MIT OR Apache-2.0 |  | runtime |
| cargo | javascriptcore-rs-sys | 1.1.1 | MIT |  | runtime |
| cargo | javascriptcore-rs | 1.1.2 | MIT |  | runtime |
| cargo | jni-sys | 0.3.0 | MIT/Apache-2.0 |  | runtime |
| cargo | jni | 0.21.1 | MIT/Apache-2.0 |  | runtime |
| cargo | js-sys | 0.3.91 | MIT OR Apache-2.0 |  | runtime |
| cargo | js-sys | 0.3.99 | MIT OR Apache-2.0 |  | runtime |
| cargo | json-patch | 3.0.1 | MIT/Apache-2.0 |  | runtime |
| cargo | jsonptr | 0.6.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | keyboard-types | 0.7.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | leb128fmt | 0.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | lexical-core | 1.0.6 | MIT/Apache-2.0 |  | runtime |
| cargo | lexical-parse-float | 1.0.6 | MIT/Apache-2.0 |  | runtime |
| cargo | lexical-parse-integer | 1.0.6 | MIT/Apache-2.0 |  | runtime |
| cargo | lexical-util | 1.0.7 | MIT/Apache-2.0 |  | runtime |
| cargo | lexical-write-float | 1.0.6 | MIT/Apache-2.0 |  | runtime |
| cargo | lexical-write-integer | 1.0.6 | MIT/Apache-2.0 |  | runtime |
| cargo | libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | libappindicator | 0.9.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | libc | 0.2.182 | MIT OR Apache-2.0 |  | runtime |
| cargo | libc | 0.2.186 | MIT OR Apache-2.0 |  | runtime |
| cargo | libdbus-sys | 0.2.7 | Apache-2.0/MIT |  | runtime |
| cargo | libduckdb-sys | 1.10503.1 | MIT |  | runtime |
| cargo | libloading | 0.7.4 | ISC |  | runtime |
| cargo | libm | 0.2.16 | MIT |  | runtime |
| cargo | libredox | 0.1.14 | MIT |  | runtime |
| cargo | linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | linux-raw-sys | 0.4.15 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | litemap | 0.8.1 | Unicode-3.0 |  | runtime |
| cargo | litemap | 0.8.2 | Unicode-3.0 |  | runtime |
| cargo | lock_api | 0.4.14 | MIT OR Apache-2.0 |  | runtime |
| cargo | log | 0.4.29 | MIT OR Apache-2.0 |  | runtime |
| cargo | log | 0.4.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | lru-slab | 0.1.2 | MIT OR Apache-2.0 OR Zlib |  | runtime |
| cargo | markup5ever | 0.38.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | memchr | 2.8.0 | Unlicense OR MIT |  | runtime |
| cargo | memchr | 2.8.1 | Unlicense OR MIT |  | runtime |
| cargo | memoffset | 0.9.1 | MIT |  | runtime |
| cargo | mime | 0.3.17 | MIT OR Apache-2.0 |  | runtime |
| cargo | miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 |  | runtime |
| cargo | mio | 1.1.1 | MIT |  | runtime |
| cargo | mio | 1.2.1 | MIT |  | runtime |
| cargo | moxcms | 0.8.1 | BSD-3-Clause OR Apache-2.0 |  | runtime |
| cargo | muda | 0.19.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 |  | runtime |
| cargo | ndk | 0.9.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | new_debug_unreachable | 1.0.6 | MIT |  | runtime |
| cargo | num_enum_derive | 0.7.5 | BSD-3-Clause OR MIT OR Apache-2.0 |  | runtime |
| cargo | num_enum | 0.7.5 | BSD-3-Clause OR MIT OR Apache-2.0 |  | runtime |
| cargo | num-bigint | 0.4.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | num-complex | 0.4.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | num-conv | 0.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | num-integer | 0.1.46 | MIT OR Apache-2.0 |  | runtime |
| cargo | num-traits | 0.2.19 | MIT OR Apache-2.0 |  | runtime |
| cargo | objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-encode | 4.1.0 | MIT |  | runtime |
| cargo | objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-foundation | 0.3.2 | MIT |  | runtime |
| cargo | objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | objc2 | 0.6.4 | MIT |  | runtime |
| cargo | once_cell | 1.21.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | once_cell | 1.21.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | open | 5.3.3 | MIT |  | runtime |
| cargo | option-ext | 0.2.0 | MPL-2.0 |  | runtime |
| cargo | ordered-stream | 0.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | pango-sys | 0.18.0 | MIT |  | runtime |
| cargo | pango | 0.18.3 | MIT |  | runtime |
| cargo | parking_lot_core | 0.9.12 | MIT OR Apache-2.0 |  | runtime |
| cargo | parking_lot | 0.12.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | parking | 2.2.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | pathdiff | 0.2.3 | MIT/Apache-2.0 |  | runtime |
| cargo | percent-encoding | 2.3.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | phf_codegen | 0.13.1 | MIT |  | runtime |
| cargo | phf_generator | 0.13.1 | MIT |  | runtime |
| cargo | phf_macros | 0.13.1 | MIT |  | runtime |
| cargo | phf_shared | 0.13.1 | MIT |  | runtime |
| cargo | phf | 0.13.1 | MIT |  | runtime |
| cargo | pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |  | runtime |
| cargo | pin-utils | 0.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | piper | 0.2.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | pkg-config | 0.3.32 | MIT OR Apache-2.0 |  | runtime |
| cargo | pkg-config | 0.3.33 | MIT OR Apache-2.0 |  | runtime |
| cargo | plist | 1.10.0 | MIT |  | runtime |
| cargo | png | 0.17.16 | MIT OR Apache-2.0 |  | runtime |
| cargo | png | 0.18.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | polling | 3.11.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | potential_utf | 0.1.4 | Unicode-3.0 |  | runtime |
| cargo | potential_utf | 0.1.5 | Unicode-3.0 |  | runtime |
| cargo | powerfmt | 0.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 |  | runtime |
| cargo | precomputed-hash | 0.1.1 | MIT |  | runtime |
| cargo | predicates-core | 1.0.10 | MIT OR Apache-2.0 |  | runtime |
| cargo | predicates-tree | 1.0.13 | MIT OR Apache-2.0 |  | runtime |
| cargo | predicates | 3.1.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | prettyplease | 0.2.37 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro-crate | 3.4.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro-error | 1.0.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | proc-macro2 | 1.0.106 | MIT OR Apache-2.0 |  | runtime |
| cargo | ptr_meta_derive | 0.1.4 | MIT |  | runtime |
| cargo | ptr_meta | 0.1.4 | MIT |  | runtime |
| cargo | pxfm | 0.1.29 | BSD-3-Clause OR Apache-2.0 |  | runtime |
| cargo | quick-xml | 0.41.0 | MIT |  | runtime |
| cargo | quinn-proto | 0.11.15 | MIT OR Apache-2.0 |  | runtime |
| cargo | quinn-udp | 0.5.14 | MIT OR Apache-2.0 |  | runtime |
| cargo | quinn | 0.11.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | quote | 1.0.44 | MIT OR Apache-2.0 |  | runtime |
| cargo | quote | 1.0.45 | MIT OR Apache-2.0 |  | runtime |
| cargo | r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |  | runtime |
| cargo | r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |  | runtime |
| cargo | radium | 0.7.0 | MIT |  | runtime |
| cargo | rand_chacha | 0.3.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | rand_chacha | 0.9.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | rand_core | 0.6.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | rand_core | 0.9.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | rand | 0.8.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | rand | 0.9.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib |  | runtime |
| cargo | rayon-core | 1.13.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | rayon | 1.12.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | redox_syscall | 0.5.18 | MIT |  | runtime |
| cargo | redox_users | 0.5.2 | MIT |  | runtime |
| cargo | ref-cast-impl | 1.0.25 | MIT OR Apache-2.0 |  | runtime |
| cargo | ref-cast | 1.0.25 | MIT OR Apache-2.0 |  | runtime |
| cargo | regex-automata | 0.4.14 | MIT OR Apache-2.0 |  | runtime |
| cargo | regex-syntax | 0.8.10 | MIT OR Apache-2.0 |  | runtime |
| cargo | regex | 1.12.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | rend | 0.4.2 | MIT |  | runtime |
| cargo | reqwest | 0.12.28 | MIT OR Apache-2.0 |  | runtime |
| cargo | reqwest | 0.13.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | rfd | 0.16.0 | MIT |  | runtime |
| cargo | ring | 0.17.14 | Apache-2.0 AND ISC |  | runtime |
| cargo | rkyv_derive | 0.7.46 | MIT |  | runtime |
| cargo | rkyv | 0.7.46 | MIT |  | runtime |
| cargo | rust_decimal | 1.42.0 | MIT |  | runtime |
| cargo | rustc_version | 0.4.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | rustc-hash | 2.1.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | rustc-hash | 2.1.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | rustix | 0.38.44 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | rustix | 1.1.4 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | rustls-pki-types | 1.14.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | rustls-webpki | 0.103.13 | ISC |  | runtime |
| cargo | rustls | 0.23.40 | Apache-2.0 OR ISC OR MIT |  | runtime |
| cargo | rustversion | 1.0.22 | MIT OR Apache-2.0 |  | runtime |
| cargo | ryu | 1.0.23 | Apache-2.0 OR BSL-1.0 |  | runtime |
| cargo | same-file | 1.0.6 | Unlicense/MIT |  | runtime |
| cargo | schemars_derive | 0.8.22 | MIT |  | runtime |
| cargo | schemars | 0.8.22 | MIT |  | runtime |
| cargo | schemars | 0.9.0 | MIT |  | runtime |
| cargo | schemars | 1.2.1 | MIT |  | runtime |
| cargo | scopeguard | 1.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | seahash | 4.1.0 | MIT |  | runtime |
| cargo | selectors | 0.36.1 | MPL-2.0 |  | runtime |
| cargo | semver | 1.0.27 | MIT OR Apache-2.0 |  | runtime |
| cargo | semver | 1.0.28 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_core | 1.0.228 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_derive | 1.0.228 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_json | 1.0.149 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_json | 1.0.150 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_repr | 0.1.20 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_spanned | 0.6.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_spanned | 1.0.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_urlencoded | 0.7.1 | MIT/Apache-2.0 |  | runtime |
| cargo | serde_with_macros | 3.21.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde_with | 3.21.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde-untagged | 0.1.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | serde | 1.0.228 | MIT OR Apache-2.0 |  | runtime |
| cargo | serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | servo_arc | 0.4.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | sha2 | 0.10.9 | MIT OR Apache-2.0 |  | runtime |
| cargo | shlex | 1.3.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | shlex | 2.0.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | simd-adler32 | 0.3.8 | MIT |  | runtime |
| cargo | simd-adler32 | 0.3.9 | MIT |  | runtime |
| cargo | simdutf8 | 0.1.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | siphasher | 1.0.2 | MIT/Apache-2.0 |  | runtime |
| cargo | slab | 0.4.12 | MIT |  | runtime |
| cargo | smallvec | 1.15.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | socket2 | 0.6.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | socket2 | 0.6.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | softbuffer | 0.4.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | soup3-sys | 0.5.0 | MIT |  | runtime |
| cargo | soup3 | 0.5.0 | MIT |  | runtime |
| cargo | stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | string_cache | 0.9.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | strsim | 0.11.1 | MIT |  | runtime |
| cargo | strum_macros | 0.27.2 | MIT |  | runtime |
| cargo | strum | 0.27.2 | MIT |  | runtime |
| cargo | subtle | 2.6.1 | BSD-3-Clause |  | runtime |
| cargo | swift-rs | 1.0.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | syn | 1.0.109 | MIT OR Apache-2.0 |  | runtime |
| cargo | syn | 2.0.117 | MIT OR Apache-2.0 |  | runtime |
| cargo | sync_wrapper | 1.0.2 | Apache-2.0 |  | runtime |
| cargo | synstructure | 0.13.2 | MIT |  | runtime |
| cargo | system-deps | 6.2.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | tao-macros | 0.1.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | tao | 0.35.3 | Apache-2.0 |  | runtime |
| cargo | tap | 1.0.1 | MIT |  | runtime |
| cargo | tar | 0.4.46 | MIT OR Apache-2.0 |  | runtime |
| cargo | target-lexicon | 0.12.16 | Apache-2.0 WITH LLVM-exception |  | runtime |
| cargo | tauri-build | 2.6.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-codegen | 2.6.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-macros | 2.6.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-plugin-dialog | 2.7.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-plugin-fs | 2.5.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-plugin-opener | 2.5.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-plugin-single-instance | 2.4.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-plugin | 2.6.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-runtime | 2.11.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-utils | 2.9.3 | Apache-2.0 OR MIT |  | runtime |
| cargo | tauri-winres | 0.3.5 | MIT |  | runtime |
| cargo | tauri | 2.11.5 | Apache-2.0 OR MIT |  | runtime |
| cargo | tempfile | 3.27.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | tendril | 0.5.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | termtree | 0.5.1 | MIT |  | runtime |
| cargo | thiserror-impl | 1.0.69 | MIT OR Apache-2.0 |  | runtime |
| cargo | thiserror-impl | 2.0.18 | MIT OR Apache-2.0 |  | runtime |
| cargo | thiserror | 1.0.69 | MIT OR Apache-2.0 |  | runtime |
| cargo | thiserror | 2.0.18 | MIT OR Apache-2.0 |  | runtime |
| cargo | time-core | 0.1.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | time-macros | 0.2.27 | MIT OR Apache-2.0 |  | runtime |
| cargo | time | 0.3.47 | MIT OR Apache-2.0 |  | runtime |
| cargo | tiny-keccak | 2.0.2 | CC0-1.0 |  | runtime |
| cargo | tinystr | 0.8.2 | Unicode-3.0 |  | runtime |
| cargo | tinystr | 0.8.3 | Unicode-3.0 |  | runtime |
| cargo | tinyvec_macros | 0.1.1 | MIT OR Apache-2.0 OR Zlib |  | runtime |
| cargo | tinyvec | 1.11.0 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | tinyvec | 1.12.0 | Zlib OR Apache-2.0 OR MIT |  | runtime |
| cargo | tokio-rustls | 0.26.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | tokio-util | 0.7.18 | MIT |  | runtime |
| cargo | tokio | 1.49.0 | MIT |  | runtime |
| cargo | tokio | 1.52.3 | MIT |  | runtime |
| cargo | toml_datetime | 0.6.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_datetime | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_edit | 0.19.15 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_edit | 0.20.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_edit | 0.23.10+spec-1.0.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_edit | 0.25.12+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_parser | 1.0.9+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_parser | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml_writer | 1.0.6+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml | 0.8.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | tower-http | 0.6.11 | MIT |  | runtime |
| cargo | tower-http | 0.6.8 | MIT |  | runtime |
| cargo | tower-layer | 0.3.3 | MIT |  | runtime |
| cargo | tower-service | 0.3.3 | MIT |  | runtime |
| cargo | tower | 0.5.3 | MIT |  | runtime |
| cargo | tracing-attributes | 0.1.31 | MIT |  | runtime |
| cargo | tracing-core | 0.1.36 | MIT |  | runtime |
| cargo | tracing | 0.1.44 | MIT |  | runtime |
| cargo | tray-icon | 0.24.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | try-lock | 0.2.5 | MIT |  | runtime |
| cargo | typeid | 1.0.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | typenum | 1.19.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | uds_windows | 1.2.1 | MIT |  | runtime |
| cargo | unicode-ident | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 |  | runtime |
| cargo | unicode-segmentation | 1.12.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | unicode-width | 0.2.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | unicode-xid | 0.2.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | untrusted | 0.9.0 | ISC |  | runtime |
| cargo | url | 2.5.8 | MIT OR Apache-2.0 |  | runtime |
| cargo | urlpattern | 0.3.0 | MIT |  | runtime |
| cargo | utf8_iter | 1.0.4 | Apache-2.0 OR MIT |  | runtime |
| cargo | uuid | 1.21.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | uuid | 1.23.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | vcpkg | 0.2.15 | MIT/Apache-2.0 |  | runtime |
| cargo | version_check | 0.9.5 | MIT/Apache-2.0 |  | runtime |
| cargo | version-compare | 0.2.1 | MIT |  | runtime |
| cargo | vswhom-sys | 0.1.3 | MIT |  | runtime |
| cargo | vswhom | 0.1.0 | MIT |  | runtime |
| cargo | wait-timeout | 0.2.1 | MIT/Apache-2.0 |  | runtime |
| cargo | walkdir | 2.5.0 | Unlicense/MIT |  | runtime |
| cargo | want | 0.3.1 | MIT |  | runtime |
| cargo | wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wasip2 | 1.0.2+wasi-0.2.9 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wasip2 | 1.0.3+wasi-0.2.9 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wasip3 | 0.4.0+wasi-0.3.0-rc-2026-01-06 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wasm-bindgen-futures | 0.4.64 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-futures | 0.4.72 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-macro-support | 0.2.114 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-macro-support | 0.2.122 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-macro | 0.2.114 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-macro | 0.2.122 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-shared | 0.2.114 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen-shared | 0.2.122 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen | 0.2.114 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-bindgen | 0.2.122 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasm-encoder | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wasm-metadata | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wasm-streams | 0.5.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | wasmparser | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | web_atoms | 0.2.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | web-sys | 0.3.91 | MIT OR Apache-2.0 |  | runtime |
| cargo | web-sys | 0.3.99 | MIT OR Apache-2.0 |  | runtime |
| cargo | web-time | 1.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | webkit2gtk-sys | 2.0.2 | MIT |  | runtime |
| cargo | webkit2gtk | 2.0.2 | MIT |  | runtime |
| cargo | webpki-roots | 1.0.7 | CDLA-Permissive-2.0 |  | runtime |
| cargo | webview2-com-macros | 0.8.1 | MIT |  | runtime |
| cargo | webview2-com-sys | 0.38.2 | MIT |  | runtime |
| cargo | webview2-com | 0.38.2 | MIT |  | runtime |
| cargo | winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 |  | runtime |
| cargo | winapi-util | 0.1.11 | Unlicense OR MIT |  | runtime |
| cargo | winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 |  | runtime |
| cargo | winapi | 0.3.9 | MIT/Apache-2.0 |  | runtime |
| cargo | window-vibrancy | 0.6.0 | Apache-2.0 OR MIT |  | runtime |
| cargo | windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-collections | 0.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-core | 0.61.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-core | 0.62.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-future | 0.2.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-implement | 0.60.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-interface | 0.59.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-link | 0.1.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-link | 0.2.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-numerics | 0.2.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-result | 0.3.4 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-result | 0.4.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-strings | 0.4.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-strings | 0.5.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-sys | 0.45.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-sys | 0.52.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-sys | 0.59.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-sys | 0.60.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-sys | 0.61.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-targets | 0.42.2 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-targets | 0.52.6 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-targets | 0.53.5 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-threading | 0.1.0 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows-version | 0.1.7 | MIT OR Apache-2.0 |  | runtime |
| cargo | windows | 0.61.3 | MIT OR Apache-2.0 |  | runtime |
| cargo | winnow | 0.5.40 | MIT |  | runtime |
| cargo | winnow | 0.7.14 | MIT |  | runtime |
| cargo | winnow | 1.0.3 | MIT |  | runtime |
| cargo | winreg | 0.55.0 | MIT |  | runtime |
| cargo | wit-bindgen-core | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wit-bindgen-rust-macro | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wit-bindgen-rust | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wit-bindgen | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wit-component | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | wit-parser | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  | runtime |
| cargo | writeable | 0.6.2 | Unicode-3.0 |  | runtime |
| cargo | writeable | 0.6.3 | Unicode-3.0 |  | runtime |
| cargo | wry | 0.55.1 | Apache-2.0 OR MIT |  | runtime |
| cargo | wyz | 0.5.1 | MIT |  | runtime |
| cargo | x11-dl | 2.21.0 | MIT |  | runtime |
| cargo | x11 | 2.21.0 | MIT |  | runtime |
| cargo | xattr | 1.6.1 | MIT OR Apache-2.0 |  | runtime |
| cargo | yoke-derive | 0.8.1 | Unicode-3.0 |  | runtime |
| cargo | yoke-derive | 0.8.2 | Unicode-3.0 |  | runtime |
| cargo | yoke | 0.8.1 | Unicode-3.0 |  | runtime |
| cargo | yoke | 0.8.3 | Unicode-3.0 |  | runtime |
| cargo | zbus_macros | 5.14.0 | MIT |  | runtime |
| cargo | zbus_names | 4.3.1 | MIT |  | runtime |
| cargo | zbus | 5.14.0 | MIT |  | runtime |
| cargo | zerocopy-derive | 0.8.40 | BSD-2-Clause OR Apache-2.0 OR MIT |  | runtime |
| cargo | zerocopy-derive | 0.8.50 | BSD-2-Clause OR Apache-2.0 OR MIT |  | runtime |
| cargo | zerocopy | 0.8.40 | BSD-2-Clause OR Apache-2.0 OR MIT |  | runtime |
| cargo | zerocopy | 0.8.50 | BSD-2-Clause OR Apache-2.0 OR MIT |  | runtime |
| cargo | zerofrom-derive | 0.1.6 | Unicode-3.0 |  | runtime |
| cargo | zerofrom-derive | 0.1.7 | Unicode-3.0 |  | runtime |
| cargo | zerofrom | 0.1.6 | Unicode-3.0 |  | runtime |
| cargo | zerofrom | 0.1.8 | Unicode-3.0 |  | runtime |
| cargo | zeroize | 1.8.2 | Apache-2.0 OR MIT |  | runtime |
| cargo | zerotrie | 0.2.3 | Unicode-3.0 |  | runtime |
| cargo | zerotrie | 0.2.4 | Unicode-3.0 |  | runtime |
| cargo | zerovec-derive | 0.11.2 | Unicode-3.0 |  | runtime |
| cargo | zerovec-derive | 0.11.3 | Unicode-3.0 |  | runtime |
| cargo | zerovec | 0.11.5 | Unicode-3.0 |  | runtime |
| cargo | zerovec | 0.11.6 | Unicode-3.0 |  | runtime |
| cargo | zip | 6.0.0 | MIT |  | runtime |
| cargo | zlib-rs | 0.6.3 | Zlib |  | runtime |
| cargo | zmij | 1.0.21 | MIT |  | runtime |
| cargo | zopfli | 0.8.3 | Apache-2.0 |  | runtime |
| cargo | zvariant_derive | 5.10.0 | MIT |  | runtime |
| cargo | zvariant_utils | 3.3.0 | MIT |  | runtime |
| cargo | zvariant | 5.10.0 | MIT |  | runtime |
| npm | @alloc/quick-lru | 5.2.0 | MIT |  | development |
| npm | @babel/runtime | 7.29.2 | MIT |  | runtime |
| npm | @bcoe/v8-coverage | 1.0.2 | MIT |  | development |
| npm | @codemirror/autocomplete | 6.20.1 | MIT |  | runtime |
| npm | @codemirror/commands | 6.10.3 | MIT |  | runtime |
| npm | @codemirror/language | 6.12.3 | MIT |  | runtime |
| npm | @codemirror/lint | 6.9.5 | MIT |  | runtime |
| npm | @codemirror/search | 6.7.0 | MIT |  | runtime |
| npm | @codemirror/state | 6.6.0 | MIT |  | runtime |
| npm | @codemirror/view | 6.41.1 | MIT |  | runtime |
| npm | @duckdb/node-api | 1.4.4-r.3 | MIT |  | runtime |
| npm | @duckdb/node-bindings-darwin-arm64 | 1.4.4-r.3 | MIT |  | runtime |
| npm | @duckdb/node-bindings-linux-x64 | 1.4.4-r.3 | MIT |  | runtime |
| npm | @duckdb/node-bindings-win32-x64 | 1.4.4-r.3 | MIT |  | runtime |
| npm | @duckdb/node-bindings | 1.4.4-r.3 | MIT |  | runtime |
| npm | @esbuild/aix-ppc64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/android-arm | 0.28.1 | MIT |  | development |
| npm | @esbuild/android-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/android-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/darwin-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/darwin-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/freebsd-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/freebsd-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-arm | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-ia32 | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-loong64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-mips64el | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-ppc64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-riscv64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-s390x | 0.28.1 | MIT |  | development |
| npm | @esbuild/linux-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/netbsd-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/netbsd-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/openbsd-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/openbsd-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/openharmony-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/sunos-x64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/win32-arm64 | 0.28.1 | MIT |  | development |
| npm | @esbuild/win32-ia32 | 0.28.1 | MIT |  | development |
| npm | @esbuild/win32-x64 | 0.28.1 | MIT |  | development |
| npm | @floating-ui/core | 1.7.5 | MIT |  | runtime |
| npm | @floating-ui/dom | 1.7.6 | MIT |  | runtime |
| npm | @floating-ui/react-dom | 2.1.8 | MIT |  | runtime |
| npm | @floating-ui/react | 0.27.19 | MIT |  | runtime |
| npm | @floating-ui/utils | 0.2.11 | MIT |  | runtime |
| npm | @formatjs/fast-memoize | 3.1.3 | MIT |  | runtime |
| npm | @formatjs/icu-messageformat-parser | 3.5.6 | MIT |  | runtime |
| npm | @formatjs/icu-skeleton-parser | 2.1.6 | MIT |  | runtime |
| npm | @istanbuljs/schema | 0.1.6 | MIT |  | development |
| npm | @jridgewell/gen-mapping | 0.3.13 | MIT |  | development |
| npm | @jridgewell/resolve-uri | 3.1.2 | MIT |  | development |
| npm | @jridgewell/sourcemap-codec | 1.5.5 | MIT |  | development |
| npm | @jridgewell/trace-mapping | 0.3.31 | MIT |  | development |
| npm | @js-temporal/polyfill | 0.5.1 | ISC |  | runtime |
| npm | @lexical/clipboard | 0.44.0 | MIT |  | runtime |
| npm | @lexical/code-core | 0.44.0 | MIT |  | runtime |
| npm | @lexical/devtools-core | 0.44.0 | MIT |  | runtime |
| npm | @lexical/dragon | 0.44.0 | MIT |  | runtime |
| npm | @lexical/extension | 0.44.0 | MIT |  | runtime |
| npm | @lexical/hashtag | 0.44.0 | MIT |  | runtime |
| npm | @lexical/history | 0.44.0 | MIT |  | runtime |
| npm | @lexical/html | 0.44.0 | MIT |  | runtime |
| npm | @lexical/link | 0.44.0 | MIT |  | runtime |
| npm | @lexical/list | 0.44.0 | MIT |  | runtime |
| npm | @lexical/mark | 0.44.0 | MIT |  | runtime |
| npm | @lexical/markdown | 0.44.0 | MIT |  | runtime |
| npm | @lexical/overflow | 0.44.0 | MIT |  | runtime |
| npm | @lexical/plain-text | 0.44.0 | MIT |  | runtime |
| npm | @lexical/react | 0.44.0 | MIT |  | runtime |
| npm | @lexical/rich-text | 0.44.0 | MIT |  | runtime |
| npm | @lexical/selection | 0.44.0 | MIT |  | runtime |
| npm | @lexical/table | 0.44.0 | MIT |  | runtime |
| npm | @lexical/text | 0.44.0 | MIT |  | runtime |
| npm | @lexical/utils | 0.44.0 | MIT |  | runtime |
| npm | @lexical/yjs | 0.44.0 | MIT |  | runtime |
| npm | @lezer/common | 1.5.2 | MIT |  | runtime |
| npm | @lezer/highlight | 1.2.3 | MIT |  | runtime |
| npm | @lezer/lr | 1.4.10 | MIT |  | runtime |
| npm | @marijn/find-cluster-break | 1.0.2 | MIT |  | runtime |
| npm | @noble/curves | 2.2.0 | MIT |  | runtime |
| npm | @noble/hashes | 2.2.0 | MIT |  | runtime |
| npm | @nodelib/fs.scandir | 2.1.5 | MIT |  | development |
| npm | @nodelib/fs.stat | 2.0.5 | MIT |  | development |
| npm | @nodelib/fs.walk | 1.2.8 | MIT |  | development |
| npm | @oxc-project/types | 0.133.0 | MIT |  | development |
| npm | @playwright/test | 1.59.1 | Apache-2.0 |  | development |
| npm | @preact/signals-core | 1.14.1 | MIT |  | runtime |
| npm | @radix-ui/number | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/primitive | 1.1.3 | MIT |  | runtime |
| npm | @radix-ui/react-arrow | 1.1.7 | MIT |  | runtime |
| npm | @radix-ui/react-collection | 1.1.7 | MIT |  | runtime |
| npm | @radix-ui/react-compose-refs | 1.1.2 | MIT |  | runtime |
| npm | @radix-ui/react-context-menu | 2.2.16 | MIT |  | runtime |
| npm | @radix-ui/react-context | 1.1.2 | MIT |  | runtime |
| npm | @radix-ui/react-dialog | 1.1.15 | MIT |  | runtime |
| npm | @radix-ui/react-direction | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-dismissable-layer | 1.1.11 | MIT |  | runtime |
| npm | @radix-ui/react-dropdown-menu | 2.1.16 | MIT |  | runtime |
| npm | @radix-ui/react-focus-guards | 1.1.3 | MIT |  | runtime |
| npm | @radix-ui/react-focus-scope | 1.1.7 | MIT |  | runtime |
| npm | @radix-ui/react-id | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-menu | 2.1.16 | MIT |  | runtime |
| npm | @radix-ui/react-popper | 1.2.8 | MIT |  | runtime |
| npm | @radix-ui/react-portal | 1.1.9 | MIT |  | runtime |
| npm | @radix-ui/react-presence | 1.1.5 | MIT |  | runtime |
| npm | @radix-ui/react-primitive | 2.1.3 | MIT |  | runtime |
| npm | @radix-ui/react-roving-focus | 1.1.11 | MIT |  | runtime |
| npm | @radix-ui/react-select | 2.2.6 | MIT |  | runtime |
| npm | @radix-ui/react-slot | 1.2.3 | MIT |  | runtime |
| npm | @radix-ui/react-use-callback-ref | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-use-controllable-state | 1.2.2 | MIT |  | runtime |
| npm | @radix-ui/react-use-effect-event | 0.0.2 | MIT |  | runtime |
| npm | @radix-ui/react-use-escape-keydown | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-use-layout-effect | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-use-previous | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-use-rect | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-use-size | 1.1.1 | MIT |  | runtime |
| npm | @radix-ui/react-visually-hidden | 1.2.3 | MIT |  | runtime |
| npm | @radix-ui/rect | 1.1.1 | MIT |  | runtime |
| npm | @rolldown/binding-darwin-arm64 | 1.0.3 | MIT |  | development |
| npm | @rolldown/binding-linux-x64-gnu | 1.0.3 | MIT |  | runtime |
| npm | @rolldown/binding-win32-x64-msvc | 1.0.3 | MIT |  | runtime |
| npm | @rolldown/pluginutils | 1.0.0-rc.7 | MIT |  | development |
| npm | @rolldown/pluginutils | 1.0.1 | MIT |  | development |
| npm | @scure/base | 2.2.0 | MIT |  | runtime |
| npm | @scure/starknet | 2.2.0 | MIT |  | runtime |
| npm | @tauri-apps/api | 2.10.1 | Apache-2.0 OR MIT |  | runtime |
| npm | @tauri-apps/cli-darwin-arm64 | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-darwin-x64 | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-linux-arm-gnueabihf | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-linux-arm64-gnu | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-linux-arm64-musl | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-linux-riscv64-gnu | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-linux-x64-gnu | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-linux-x64-musl | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-win32-arm64-msvc | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-win32-ia32-msvc | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli-win32-x64-msvc | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/cli | 2.10.1 | Apache-2.0 OR MIT |  | development |
| npm | @tauri-apps/plugin-dialog | 2.7.0 | MIT OR Apache-2.0 |  | runtime |
| npm | @tauri-apps/plugin-opener | 2.5.3 | MIT OR Apache-2.0 |  | runtime |
| npm | @types/better-sqlite3 | 7.6.13 | MIT |  | development |
| npm | @types/body-parser | 1.19.6 | MIT |  | development |
| npm | @types/connect | 3.4.38 | MIT |  | development |
| npm | @types/express-serve-static-core | 5.1.1 | MIT |  | development |
| npm | @types/express | 5.0.6 | MIT |  | development |
| npm | @types/http-errors | 2.0.5 | MIT |  | development |
| npm | @types/istanbul-lib-coverage | 2.0.6 | MIT |  | development |
| npm | @types/node | 24.13.3 | MIT |  | development |
| npm | @types/node | 25.6.0 | MIT |  | development |
| npm | @types/pako | 2.0.4 | MIT |  | runtime |
| npm | @types/qs | 6.15.0 | MIT |  | development |
| npm | @types/raf | 3.4.3 | MIT |  | runtime |
| npm | @types/range-parser | 1.2.7 | MIT |  | development |
| npm | @types/react-dom | 19.2.3 | MIT |  | runtime |
| npm | @types/react | 19.2.14 | MIT |  | runtime |
| npm | @types/send | 1.2.1 | MIT |  | development |
| npm | @types/serve-static | 2.2.0 | MIT |  | development |
| npm | @types/trusted-types | 2.0.7 | MIT |  | runtime |
| npm | @vitejs/plugin-react | 6.0.1 | MIT |  | development |
| npm | @xmldom/xmldom | 0.9.10 | MIT |  | runtime |
| npm | abort-controller | 3.0.0 | MIT |  | development |
| npm | accepts | 2.0.0 | MIT |  | runtime |
| npm | ansi-regex | 5.0.1 | MIT |  | development |
| npm | ansi-styles | 4.3.0 | MIT |  | development |
| npm | any-promise | 1.3.0 | MIT |  | development |
| npm | anymatch | 3.1.3 | ISC |  | development |
| npm | archiver-node | 8.0.8 | MIT |  | development |
| npm | arg | 5.0.2 | MIT |  | development |
| npm | aria-hidden | 1.2.6 | MIT |  | runtime |
| npm | async | 3.2.6 | MIT |  | development |
| npm | autoprefixer | 10.5.0 | MIT |  | development |
| npm | b4a | 1.8.1 | Apache-2.0 |  | development |
| npm | balanced-match | 4.0.4 | MIT |  | development |
| npm | bare-events | 2.8.2 | Apache-2.0 |  | development |
| npm | bare-fs | 4.7.1 | Apache-2.0 |  | development |
| npm | bare-os | 3.9.1 | Apache-2.0 |  | development |
| npm | bare-path | 3.0.0 | Apache-2.0 |  | development |
| npm | bare-stream | 2.13.1 | Apache-2.0 |  | development |
| npm | bare-url | 2.4.2 | Apache-2.0 |  | development |
| npm | base64-arraybuffer | 1.0.2 | MIT |  | runtime |
| npm | base64-js | 1.5.1 | MIT |  | runtime |
| npm | baseline-browser-mapping | 2.10.27 | Apache-2.0 |  | development |
| npm | better-sqlite3 | 12.9.0 | MIT |  | runtime |
| npm | binary-extensions | 2.3.0 | MIT |  | development |
| npm | bindings | 1.5.0 | MIT |  | runtime |
| npm | bl | 4.1.0 | MIT |  | runtime |
| npm | bluebird | 3.7.2 | MIT |  | runtime |
| npm | body-parser | 2.3.0 | MIT |  | runtime |
| npm | brace-expansion | 5.0.9 | MIT |  | development |
| npm | braces | 3.0.3 | MIT |  | development |
| npm | browserslist | 4.28.2 | MIT |  | development |
| npm | buffer-crc32 | 1.0.0 | MIT |  | development |
| npm | buffer | 5.7.1 | MIT |  | runtime |
| npm | buffer | 6.0.3 | MIT |  | development |
| npm | bufferutil | 4.1.0 | MIT |  | runtime |
| npm | bytes | 3.1.2 | MIT |  | runtime |
| npm | c8 | 11.0.0 | ISC |  | development |
| npm | call-bind-apply-helpers | 1.0.2 | MIT |  | runtime |
| npm | call-bound | 1.0.4 | MIT |  | runtime |
| npm | camelcase-css | 2.0.1 | MIT |  | development |
| npm | caniuse-lite | 1.0.30001791 | CC-BY-4.0 |  | development |
| npm | canvg | 3.0.11 | MIT |  | runtime |
| npm | ccxt | 4.5.73 | MIT |  | runtime |
| npm | chokidar | 3.6.0 | MIT |  | development |
| npm | chownr | 1.1.4 | ISC |  | runtime |
| npm | class-variance-authority | 0.7.1 | Apache-2.0 |  | runtime |
| npm | cliui | 8.0.1 | ISC |  | development |
| npm | clsx | 2.1.1 | MIT |  | runtime |
| npm | codemirror | 6.0.2 | MIT |  | runtime |
| npm | color-convert | 2.0.1 | MIT |  | development |
| npm | color-name | 1.1.4 | MIT |  | development |
| npm | commander | 4.1.1 | MIT |  | development |
| npm | compress-commons | 7.0.0 | MIT |  | development |
| npm | content-disposition | 1.1.0 | MIT |  | runtime |
| npm | content-type | 1.0.5 | MIT |  | runtime |
| npm | content-type | 2.0.0 | MIT |  | runtime |
| npm | convert-source-map | 2.0.0 | MIT |  | development |
| npm | cookie-signature | 1.2.2 | MIT |  | runtime |
| npm | cookie | 0.7.2 | MIT |  | runtime |
| npm | core-js | 3.49.0 | MIT |  | runtime |
| npm | core-util-is | 1.0.3 | MIT |  | runtime |
| npm | crc-32 | 1.2.2 | Apache-2.0 |  | development |
| npm | crc32-stream | 7.0.1 | MIT |  | development |
| npm | crelt | 1.0.6 | MIT |  | runtime |
| npm | cross-spawn | 7.0.6 | MIT |  | development |
| npm | css-line-break | 2.1.0 | MIT |  | runtime |
| npm | cssesc | 3.0.0 | MIT |  | development |
| npm | csstype | 3.2.3 | MIT |  | runtime |
| npm | debug | 4.4.3 | MIT |  | runtime |
| npm | decompress-response | 6.0.0 | MIT |  | runtime |
| npm | deep-extend | 0.6.0 | MIT |  | runtime |
| npm | depd | 2.0.0 | MIT |  | runtime |
| npm | detect-libc | 2.1.2 | Apache-2.0 |  | runtime |
| npm | detect-node-es | 1.1.0 | MIT |  | runtime |
| npm | didyoumean | 1.2.2 | Apache-2.0 |  | development |
| npm | dlv | 1.1.3 | MIT |  | development |
| npm | dompurify | 3.4.13 | (MPL-2.0 OR Apache-2.0) |  | runtime |
| npm | dunder-proto | 1.0.1 | MIT |  | runtime |
| npm | duplexer2 | 0.1.4 | BSD-3-Clause |  | runtime |
| npm | echarts | 6.1.0 | Apache-2.0 |  | runtime |
| npm | ee-first | 1.1.1 | MIT |  | runtime |
| npm | electron-to-chromium | 1.5.349 | ISC |  | development |
| npm | emoji-regex | 8.0.0 | MIT |  | development |
| npm | encodeurl | 2.0.0 | MIT |  | runtime |
| npm | end-of-stream | 1.4.5 | MIT |  | runtime |
| npm | es-define-property | 1.0.1 | MIT |  | runtime |
| npm | es-errors | 1.3.0 | MIT |  | runtime |
| npm | es-object-atoms | 1.1.1 | MIT |  | runtime |
| npm | esbuild | 0.28.1 | MIT |  | development |
| npm | escalade | 3.2.0 | MIT |  | development |
| npm | escape-html | 1.0.3 | MIT |  | runtime |
| npm | etag | 1.8.1 | MIT |  | runtime |
| npm | event-target-shim | 5.0.1 | MIT |  | development |
| npm | events-universal | 1.0.1 | Apache-2.0 |  | development |
| npm | events | 3.3.0 | MIT |  | development |
| npm | expand-template | 2.0.3 | (MIT OR WTFPL) |  | runtime |
| npm | express | 5.2.1 | MIT |  | runtime |
| npm | fast-fifo | 1.3.2 | MIT |  | development |
| npm | fast-glob | 3.3.3 | MIT |  | development |
| npm | fast-png | 6.4.0 | MIT |  | runtime |
| npm | fastq | 1.20.1 | ISC |  | development |
| npm | fdir | 6.5.0 | MIT |  | development |
| npm | fflate | 0.8.3 | MIT |  | runtime |
| npm | file-uri-to-path | 1.0.0 | MIT |  | runtime |
| npm | fill-range | 7.1.1 | MIT |  | development |
| npm | finalhandler | 2.1.1 | MIT |  | runtime |
| npm | find-up | 5.0.0 | MIT |  | development |
| npm | foreground-child | 3.3.1 | ISC |  | development |
| npm | forwarded | 0.2.0 | MIT |  | runtime |
| npm | fraction.js | 5.3.4 | MIT |  | development |
| npm | fresh | 2.0.0 | MIT |  | runtime |
| npm | fs-constants | 1.0.0 | MIT |  | runtime |
| npm | fs-extra | 11.3.4 | MIT |  | runtime |
| npm | fsevents | 2.3.2 | MIT |  | development |
| npm | fsevents | 2.3.3 | MIT |  | development |
| npm | function-bind | 1.1.2 | MIT |  | runtime |
| npm | get-caller-file | 2.0.5 | ISC |  | development |
| npm | get-intrinsic | 1.3.0 | MIT |  | runtime |
| npm | get-nonce | 1.0.1 | MIT |  | runtime |
| npm | get-proto | 1.0.1 | MIT |  | runtime |
| npm | github-from-package | 0.0.0 | MIT |  | runtime |
| npm | glob-parent | 5.1.2 | ISC |  | development |
| npm | glob-parent | 6.0.2 | ISC |  | development |
| npm | glob | 13.0.6 | BlueOak-1.0.0 |  | development |
| npm | gopd | 1.2.0 | MIT |  | runtime |
| npm | graceful-fs | 4.2.11 | ISC |  | runtime |
| npm | has-flag | 4.0.0 | MIT |  | development |
| npm | has-symbols | 1.1.0 | MIT |  | runtime |
| npm | hasown | 2.0.4 | MIT |  | runtime |
| npm | html-escaper | 2.0.2 | MIT |  | development |
| npm | html2canvas | 1.4.1 | MIT |  | runtime |
| npm | http-errors | 2.0.1 | MIT |  | runtime |
| npm | iconv-lite | 0.7.2 | MIT |  | runtime |
| npm | ieee754 | 1.2.1 | BSD-3-Clause |  | runtime |
| npm | inherits | 2.0.4 | ISC |  | runtime |
| npm | ini | 1.3.8 | ISC |  | runtime |
| npm | intl-messageformat | 11.2.3 | BSD-3-Clause |  | runtime |
| npm | iobuffer | 5.4.0 | MIT |  | runtime |
| npm | ipaddr.js | 1.9.1 | MIT |  | runtime |
| npm | is-binary-path | 2.1.0 | MIT |  | development |
| npm | is-core-module | 2.16.1 | MIT |  | development |
| npm | is-extglob | 2.1.1 | MIT |  | development |
| npm | is-fullwidth-code-point | 3.0.0 | MIT |  | development |
| npm | is-glob | 4.0.3 | MIT |  | development |
| npm | is-number | 7.0.0 | MIT |  | development |
| npm | is-promise | 4.0.0 | MIT |  | runtime |
| npm | is-stream | 4.0.1 | MIT |  | development |
| npm | isarray | 1.0.0 | MIT |  | runtime |
| npm | isexe | 2.0.0 | ISC |  | development |
| npm | isomorphic.js | 0.2.5 | MIT |  | runtime |
| npm | istanbul-lib-coverage | 3.2.2 | BSD-3-Clause |  | development |
| npm | istanbul-lib-report | 3.0.1 | BSD-3-Clause |  | development |
| npm | istanbul-reports | 3.2.0 | BSD-3-Clause |  | development |
| npm | jiti | 1.21.7 | MIT |  | development |
| npm | jsbi | 4.3.2 | Apache-2.0 |  | runtime |
| npm | jsonfile | 6.2.1 | MIT |  | runtime |
| npm | jspdf | 4.2.1 | MIT |  | runtime |
| npm | klinecharts | 10.0.0-beta2 | Apache-2.0 |  | runtime |
| npm | lexical | 0.44.0 | MIT |  | runtime |
| npm | lib0 | 0.2.117 | MIT |  | runtime |
| npm | lightningcss-darwin-arm64 | 1.32.0 | MPL-2.0 |  | development |
| npm | lightningcss-linux-x64-gnu | 1.32.0 | MPL-2.0 |  | runtime |
| npm | lightningcss-win32-x64-msvc | 1.32.0 | MPL-2.0 |  | runtime |
| npm | lightningcss | 1.32.0 | MPL-2.0 |  | development |
| npm | lilconfig | 3.1.3 | MIT |  | development |
| npm | lines-and-columns | 1.2.4 | MIT |  | development |
| npm | locate-path | 6.0.0 | MIT |  | development |
| npm | lru-cache | 11.5.1 | BlueOak-1.0.0 |  | development |
| npm | lucide-react | 0.577.0 | ISC |  | runtime |
| npm | make-dir | 4.0.0 | MIT |  | development |
| npm | math-intrinsics | 1.1.0 | MIT |  | runtime |
| npm | media-typer | 1.1.0 | MIT |  | runtime |
| npm | merge-descriptors | 2.0.0 | MIT |  | runtime |
| npm | merge2 | 1.4.1 | MIT |  | development |
| npm | micromatch | 4.0.8 | MIT |  | development |
| npm | mime-db | 1.54.0 | MIT |  | runtime |
| npm | mime-types | 3.0.2 | MIT |  | runtime |
| npm | mimic-response | 3.1.0 | MIT |  | runtime |
| npm | minimatch | 10.2.5 | BlueOak-1.0.0 |  | development |
| npm | minimatch | 10.2.6 | BlueOak-1.0.0 |  | development |
| npm | minimist | 1.2.8 | MIT |  | runtime |
| npm | minipass | 7.1.3 | BlueOak-1.0.0 |  | development |
| npm | mkdirp-classic | 0.5.3 | MIT |  | runtime |
| npm | ms | 2.1.3 | MIT |  | runtime |
| npm | mz | 2.7.0 | MIT |  | development |
| npm | nanoid | 3.3.18 | MIT |  | development |
| npm | napi-build-utils | 2.0.0 | MIT |  | runtime |
| npm | negotiator | 1.0.0 | MIT |  | runtime |
| npm | node-abi | 3.90.0 | MIT |  | runtime |
| npm | node-gyp-build | 4.8.4 | MIT |  | runtime |
| npm | node-int64 | 0.4.0 | MIT |  | runtime |
| npm | node-releases | 2.0.38 | MIT |  | development |
| npm | normalize-path | 3.0.0 | MIT |  | development |
| npm | object-assign | 4.1.1 | MIT |  | development |
| npm | object-hash | 3.0.0 | MIT |  | development |
| npm | object-inspect | 1.13.4 | MIT |  | runtime |
| npm | on-finished | 2.4.1 | MIT |  | runtime |
| npm | once | 1.4.0 | ISC |  | runtime |
| npm | p-limit | 3.1.0 | MIT |  | development |
| npm | p-locate | 5.0.0 | MIT |  | development |
| npm | pako | 2.1.0 | (MIT AND Zlib) |  | runtime |
| npm | parseurl | 1.3.3 | MIT |  | runtime |
| npm | path-exists | 4.0.0 | MIT |  | development |
| npm | path-key | 3.1.1 | MIT |  | development |
| npm | path-parse | 1.0.7 | MIT |  | development |
| npm | path-scurry | 2.0.2 | BlueOak-1.0.0 |  | development |
| npm | path-to-regexp | 8.4.2 | MIT |  | runtime |
| npm | performance-now | 2.1.0 | MIT |  | runtime |
| npm | picocolors | 1.1.1 | ISC |  | development |
| npm | picomatch | 2.3.2 | MIT |  | development |
| npm | picomatch | 4.0.4 | MIT |  | development |
| npm | pify | 2.3.0 | MIT |  | development |
| npm | pirates | 4.0.7 | MIT |  | development |
| npm | playwright-core | 1.59.1 | Apache-2.0 |  | development |
| npm | playwright | 1.59.1 | Apache-2.0 |  | development |
| npm | postcss-import | 15.1.0 | MIT |  | development |
| npm | postcss-js | 4.1.0 | MIT |  | development |
| npm | postcss-load-config | 6.0.1 | MIT |  | development |
| npm | postcss-nested | 6.2.0 | MIT |  | development |
| npm | postcss-selector-parser | 6.1.2 | MIT |  | development |
| npm | postcss-value-parser | 4.2.0 | MIT |  | development |
| npm | postcss | 8.5.25 | MIT |  | development |
| npm | prebuild-install | 7.1.3 | MIT |  | runtime |
| npm | process-nextick-args | 2.0.1 | MIT |  | runtime |
| npm | process | 0.11.10 | MIT |  | development |
| npm | proxy-addr | 2.0.7 | MIT |  | runtime |
| npm | pump | 3.0.4 | MIT |  | runtime |
| npm | qs | 6.15.2 | BSD-3-Clause |  | runtime |
| npm | queue-microtask | 1.2.3 | MIT |  | development |
| npm | raf | 3.4.1 | MIT |  | runtime |
| npm | range-parser | 1.2.1 | MIT |  | runtime |
| npm | raw-body | 3.0.2 | MIT |  | runtime |
| npm | rc | 1.2.8 | (BSD-2-Clause OR MIT OR Apache-2.0) |  | runtime |
| npm | react-dom | 19.2.5 | MIT |  | runtime |
| npm | react-error-boundary | 6.1.1 | MIT |  | runtime |
| npm | react-remove-scroll-bar | 2.3.8 | MIT |  | runtime |
| npm | react-remove-scroll | 2.7.2 | MIT |  | runtime |
| npm | react-style-singleton | 2.2.3 | MIT |  | runtime |
| npm | react | 19.2.5 | MIT |  | runtime |
| npm | read-cache | 1.0.0 | MIT |  | development |
| npm | read-excel-file | 9.0.9 | MIT |  | runtime |
| npm | readable-stream | 2.3.8 | MIT |  | runtime |
| npm | readable-stream | 3.6.2 | MIT |  | runtime |
| npm | readable-stream | 4.7.0 | MIT |  | development |
| npm | readdir-glob | 3.0.0 | Apache-2.0 |  | development |
| npm | readdirp | 3.6.0 | MIT |  | development |
| npm | regenerator-runtime | 0.13.11 | MIT |  | runtime |
| npm | require-directory | 2.1.1 | MIT |  | development |
| npm | resolve | 1.22.12 | MIT |  | development |
| npm | reusify | 1.1.0 | MIT |  | development |
| npm | rgbcolor | 1.0.1 | MIT | The package metadata offers MIT as an explicit alternative; this distribution selects that option. | runtime |
| npm | rolldown | 1.0.3 | MIT |  | development |
| npm | router | 2.2.0 | MIT |  | runtime |
| npm | run-parallel | 1.2.0 | MIT |  | development |
| npm | safe-buffer | 5.1.2 | MIT |  | runtime |
| npm | safe-buffer | 5.2.1 | MIT |  | runtime |
| npm | safer-buffer | 2.1.2 | MIT |  | runtime |
| npm | scheduler | 0.27.0 | MIT |  | runtime |
| npm | semver | 7.7.4 | ISC |  | runtime |
| npm | semver | 7.8.3 | ISC |  | development |
| npm | send | 1.2.1 | MIT |  | runtime |
| npm | serve-static | 2.2.1 | MIT |  | runtime |
| npm | setprototypeof | 1.2.0 | ISC |  | runtime |
| npm | shebang-command | 2.0.0 | MIT |  | development |
| npm | shebang-regex | 3.0.0 | MIT |  | development |
| npm | side-channel-list | 1.0.1 | MIT |  | runtime |
| npm | side-channel-map | 1.0.1 | MIT |  | runtime |
| npm | side-channel-weakmap | 1.0.2 | MIT |  | runtime |
| npm | side-channel | 1.1.0 | MIT |  | runtime |
| npm | signal-exit | 4.1.0 | ISC |  | development |
| npm | simple-concat | 1.0.1 | MIT |  | runtime |
| npm | simple-get | 4.0.1 | MIT |  | runtime |
| npm | source-map-js | 1.2.1 | BSD-3-Clause |  | development |
| npm | stackblur-canvas | 2.7.0 | MIT |  | runtime |
| npm | statuses | 2.0.2 | MIT |  | runtime |
| npm | streamx | 2.25.0 | MIT |  | development |
| npm | string_decoder | 1.1.1 | MIT |  | runtime |
| npm | string_decoder | 1.3.0 | MIT |  | runtime |
| npm | string-width | 4.2.3 | MIT |  | development |
| npm | strip-ansi | 6.0.1 | MIT |  | development |
| npm | strip-json-comments | 2.0.1 | MIT |  | runtime |
| npm | style-mod | 4.1.3 | MIT |  | runtime |
| npm | sucrase | 3.35.1 | MIT |  | development |
| npm | supports-color | 7.2.0 | MIT |  | development |
| npm | supports-preserve-symlinks-flag | 1.0.0 | MIT |  | development |
| npm | svg-pathdata | 6.0.3 | MIT |  | runtime |
| npm | tabbable | 6.4.0 | MIT |  | runtime |
| npm | tailwind-merge | 2.6.1 | MIT |  | runtime |
| npm | tailwindcss | 3.4.19 | MIT |  | development |
| npm | tar-fs | 2.1.4 | MIT |  | runtime |
| npm | tar-stream | 2.2.0 | MIT |  | runtime |
| npm | tar-stream | 3.2.0 | MIT |  | development |
| npm | teex | 1.0.1 | MIT |  | development |
| npm | test-exclude | 8.0.0 | ISC |  | development |
| npm | text-decoder | 1.2.7 | Apache-2.0 |  | development |
| npm | text-segmentation | 1.0.3 | MIT |  | runtime |
| npm | thenify-all | 1.6.0 | MIT |  | development |
| npm | thenify | 3.3.1 | MIT |  | development |
| npm | tinyglobby | 0.2.17 | MIT |  | development |
| npm | to-regex-range | 5.0.1 | MIT |  | development |
| npm | toidentifier | 1.0.1 | MIT |  | runtime |
| npm | ts-interface-checker | 0.1.13 | Apache-2.0 |  | development |
| npm | tslib | 2.3.0 | 0BSD |  | runtime |
| npm | tslib | 2.8.1 | 0BSD |  | runtime |
| npm | tsx | 4.23.1 | MIT |  | development |
| npm | tunnel-agent | 0.6.0 | Apache-2.0 |  | runtime |
| npm | type-is | 2.1.0 | MIT |  | runtime |
| npm | typescript | 5.9.3 | Apache-2.0 |  | development |
| npm | undici-types | 7.18.2 | MIT |  | development |
| npm | undici-types | 7.19.2 | MIT |  | development |
| npm | undici | 7.29.0 | MIT |  | runtime |
| npm | universalify | 2.0.1 | MIT |  | runtime |
| npm | unpipe | 1.0.0 | MIT |  | runtime |
| npm | unzipper | 0.12.3 | MIT |  | runtime |
| npm | update-browserslist-db | 1.2.3 | MIT |  | development |
| npm | use-callback-ref | 1.3.3 | MIT |  | runtime |
| npm | use-sidecar | 1.1.3 | MIT |  | runtime |
| npm | util-deprecate | 1.0.2 | MIT |  | runtime |
| npm | utrie | 1.0.2 | MIT |  | runtime |
| npm | v8-to-istanbul | 9.3.0 | ISC |  | development |
| npm | vary | 1.1.2 | MIT |  | runtime |
| npm | vite | 8.0.16 | MIT |  | development |
| npm | w3c-keyname | 2.2.8 | MIT |  | runtime |
| npm | which | 2.0.2 | ISC |  | development |
| npm | wrap-ansi | 7.0.0 | MIT |  | development |
| npm | wrappy | 1.0.2 | ISC |  | runtime |
| npm | write-excel-file | 4.0.5 | MIT |  | development |
| npm | ws | 8.21.0 | MIT |  | runtime |
| npm | y18n | 5.0.8 | ISC |  | development |
| npm | yaml | 1.10.3 | ISC |  | development |
| npm | yargs-parser | 21.1.1 | ISC |  | development |
| npm | yargs | 17.7.2 | MIT |  | development |
| npm | yjs | 13.6.30 | MIT |  | runtime |
| npm | yocto-queue | 0.1.0 | MIT |  | development |
| npm | zip-stream | 7.0.2 | MIT |  | development |
| npm | zod | 4.4.3 | MIT |  | runtime |
| npm | zrender | 6.1.0 | BSD-3-Clause |  | runtime |
| pypi | akracer | 0.0.14 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/akracer/0.0.14/ | platform-conditional-sidecar-lock |
| pypi | akshare | 1.18.91 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/akshare/1.18.91/ | sidecar-lock |
| pypi | aktools | 0.0.91 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/aktools/0.0.91/ | sidecar-lock |
| pypi | altgraph | 0.17.5 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/altgraph/0.17.5/ | sidecar-lock |
| pypi | annotated-doc | 0.0.4 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/annotated-doc/0.0.4/ | sidecar-lock |
| pypi | annotated-types | 0.7.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/annotated-types/0.7.0/ | sidecar-lock |
| pypi | anyio | 4.14.2 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/anyio/4.14.2/ | sidecar-lock |
| pypi | beautifulsoup4 | 4.15.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/beautifulsoup4/4.15.0/ | sidecar-lock |
| pypi | certifi | 2026.6.17 | MPL-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/certifi/2026.6.17/ | sidecar-lock |
| pypi | certifi | 2026.7.22 | MPL-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/certifi/2026.7.22/ | sidecar-lock |
| pypi | cffi | 2.1.0 | MIT-0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/cffi/2.1.0/ | sidecar-lock |
| pypi | charset-normalizer | 3.4.9 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/charset-normalizer/3.4.9/ | sidecar-lock |
| pypi | charset-normalizer | 3.5.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/charset-normalizer/3.5.0/ | sidecar-lock |
| pypi | click | 8.4.2 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/click/8.4.2/ | sidecar-lock |
| pypi | colorama | 0.4.6 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/colorama/0.4.6/ | platform-conditional-sidecar-lock |
| pypi | curl-cffi | 0.15.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/curl-cffi/0.15.0/ | sidecar-lock |
| pypi | decorator | 5.3.1 | BSD-2-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/decorator/5.3.1/ | sidecar-lock |
| pypi | et-xmlfile | 2.0.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/et-xmlfile/2.0.0/ | sidecar-lock |
| pypi | fastapi | 0.139.2 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/fastapi/0.139.2/ | sidecar-lock |
| pypi | finance-datareader | 0.9.202 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/finance-datareader/0.9.202/ | sidecar-lock |
| pypi | h11 | 0.16.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/h11/0.16.0/ | sidecar-lock |
| pypi | html5lib | 1.1 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/html5lib/1.1/ | sidecar-lock |
| pypi | idna | 3.18 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/idna/3.18/ | sidecar-lock |
| pypi | jinja2 | 3.1.6 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/jinja2/3.1.6/ | sidecar-lock |
| pypi | jsonpath | 0.82.2 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/jsonpath/0.82.2/ | sidecar-lock |
| pypi | lxml | 6.1.1 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/lxml/6.1.1/ | sidecar-lock |
| pypi | macholib | 1.16.4 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/macholib/1.16.4/ | platform-conditional-sidecar-lock |
| pypi | markdown-it-py | 4.2.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/markdown-it-py/4.2.0/ | sidecar-lock |
| pypi | markupsafe | 3.0.3 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/markupsafe/3.0.3/ | sidecar-lock |
| pypi | mdurl | 0.1.2 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/mdurl/0.1.2/ | sidecar-lock |
| pypi | mini-racer | 0.14.1 | ISC | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/mini-racer/0.14.1/ | platform-conditional-sidecar-lock |
| pypi | narwhals | 2.24.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/narwhals/2.24.0/ | sidecar-lock |
| pypi | numpy | 2.4.6 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/numpy/2.4.6/ | sidecar-lock |
| pypi | openpyxl | 3.1.5 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/openpyxl/3.1.5/ | sidecar-lock |
| pypi | packaging | 26.2 | Apache-2.0 OR BSD-2-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/packaging/26.2/ | sidecar-lock |
| pypi | packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/packaging/26.3/ | sidecar-lock |
| pypi | pandas | 3.0.3 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pandas/3.0.3/ | sidecar-lock |
| pypi | pandas | 3.0.5 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pandas/3.0.5/ | sidecar-lock |
| pypi | pefile | 2023.2.7 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pefile/2023.2.7/ | platform-conditional-sidecar-lock |
| pypi | plotly | 6.9.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/plotly/6.9.0/ | sidecar-lock |
| pypi | py-mini-racer | 0.6.0 | ISC | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/py-mini-racer/0.6.0/ | platform-conditional-sidecar-lock |
| pypi | pycparser | 3.0 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pycparser/3.0/ | sidecar-lock |
| pypi | pydantic-core | 2.46.4 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pydantic-core/2.46.4/ | sidecar-lock |
| pypi | pydantic | 2.13.4 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pydantic/2.13.4/ | sidecar-lock |
| pypi | pygments | 2.20.0 | BSD-2-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pygments/2.20.0/ | sidecar-lock |
| pypi | pyinstaller-hooks-contrib | 2026.6 | GPL-2.0-or-later AND Apache-2.0 | Exact-release LICENSE: GPL-2.0-or-later standard hooks and Apache-2.0 runtime hooks. | sidecar-lock |
| pypi | pyinstaller | 6.16.0 | (GPL-2.0-or-later WITH Bootloader-exception) AND Apache-2.0 AND MIT | Exact-release COPYING.txt: GPL-2.0-or-later with Bootloader exception, Apache-2.0 runtime hooks, and MIT isolated module. | bundled-build-runtime |
| pypi | python-dateutil | 2.9.0.post0 | BSD-3-Clause OR Apache-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/python-dateutil/2.9.0.post0/ | sidecar-lock |
| pypi | python-multipart | 0.0.32 | Apache-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/python-multipart/0.0.32/ | sidecar-lock |
| pypi | pywin32-ctypes | 0.2.3 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/pywin32-ctypes/0.2.3/ | platform-conditional-sidecar-lock |
| pypi | requests-file | 3.0.1 | Apache-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/requests-file/3.0.1/ | sidecar-lock |
| pypi | requests | 2.34.2 | Apache-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/requests/2.34.2/ | sidecar-lock |
| pypi | rich | 15.0.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/rich/15.0.0/ | sidecar-lock |
| pypi | setuptools | 83.0.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/setuptools/83.0.0/ | sidecar-lock |
| pypi | setuptools | 84.0.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/setuptools/84.0.0/ | sidecar-lock |
| pypi | shellingham | 1.5.4 | ISC | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/shellingham/1.5.4/ | sidecar-lock |
| pypi | six | 1.17.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/six/1.17.0/ | sidecar-lock |
| pypi | soupsieve | 2.9 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/soupsieve/2.9/ | sidecar-lock |
| pypi | soupsieve | 2.9.2 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/soupsieve/2.9.2/ | sidecar-lock |
| pypi | starlette | 1.3.1 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/starlette/1.3.1/ | sidecar-lock |
| pypi | tabulate | 0.10.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/tabulate/0.10.0/ | sidecar-lock |
| pypi | tqdm | 4.69.0 | MPL-2.0 AND MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/tqdm/4.69.0/ | sidecar-lock |
| pypi | tqdm | 4.70.0 | MPL-2.0 AND MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/tqdm/4.70.0/ | sidecar-lock |
| pypi | typer | 0.27.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/typer/0.27.0/ | sidecar-lock |
| pypi | typing-extensions | 4.16.0 | PSF-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/typing-extensions/4.16.0/ | sidecar-lock |
| pypi | typing-inspection | 0.4.2 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/typing-inspection/0.4.2/ | sidecar-lock |
| pypi | tzdata | 2026.3 | Apache-2.0 | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/tzdata/2026.3/ | platform-conditional-sidecar-lock |
| pypi | urllib3 | 2.7.0 | MIT | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/urllib3/2.7.0/ | sidecar-lock |
| pypi | uvicorn | 0.51.0 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/uvicorn/0.51.0/ | sidecar-lock |
| pypi | webencodings | 0.5.1 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/webencodings/0.5.1/ | sidecar-lock |
| pypi | xlrd | 2.0.2 | BSD-3-Clause | Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/xlrd/2.0.2/ | sidecar-lock |
| runtime | CPython | 3.11.15 | PSF-2.0 | CPython 3.11.15 LICENSE and PSF license history: https://docs.python.org/3.11/license.html | bundled-sidecar-runtime |
