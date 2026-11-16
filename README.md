# VRC 16:9 Frame

縦長（2:3 など）や正方形の画像に黒枠をつけて **16:9** に変換し（縦長の画像は90°回転して横向きに）、VRChat にアップロードできるサイズ（最大辺 2048px 以下）で書き出す Web アプリです。

**👉 https://abemaru.github.io/vrc-169-frame/**

画像はすべてブラウザ内（Canvas）で処理され、サーバーには送信されません。

## できること

- 画像をドロップ / クリックで選択 / Ctrl+V で貼り付け（複数枚まとめて変換可）
- 縦長画像の回転方向（右 / 左に90°）
- 出力サイズ：2048×1152（VRChat 上限内で最大）/ 1920×1080 / 1280×720
- PNG / JPEG（画質指定）で書き出し
- スマホの写真も EXIF の向きを反映して正しく配置

## 開発

```sh
npm install
npm run dev     # 開発サーバー
npm run build   # dist/ にビルド
```

`main` ブランチに push すると GitHub Actions で GitHub Pages にデプロイされます。

## 技術構成

Vite + React + TypeScript。合成処理は `src/compose.ts`。
