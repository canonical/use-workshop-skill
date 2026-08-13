<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Fjordline (iOS)

Native iOS client. Building requires Xcode 16 on macOS — open
`Fjordline.xcodeproj` or run:

```
xcodebuild -project Fjordline.xcodeproj -scheme Fjordline build test
```

There is no Linux or cross-platform build path; UI tests run in the iOS
Simulator only.
