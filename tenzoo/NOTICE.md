# 参考にしたもの

- エーデル形式（.edl・.ezi・.sebk）と ESA721 の座標系は、利用者から提供された解析資料（edlprt の開発で作られた
  edl-format / sebk-format / analysis-summary。実物ファイル、ESA721 Ver'95 説明書、jmbraille の出力コードの解析）に基づきます。

- エーデル形式（.edl）の構造は、[tenji-editor](https://github.com/setsukashiraishi-hub/tenji-editor)（MIT License, Copyright (c) 2026 tenji-editor contributors）
  による実物ファイルの解析結果（`js/formats.js` の説明）を参考にし、`js/io/edl.js` を独自に実装しました。
  tenji-editor のテスト用ファイルで、読み書きの往復がバイト単位で一致することを確認しています（ファイル自体は同梱していません）。
- 日本語点字の表記は、日本点字委員会『日本点字表記法』に基づく一般的な対応表によります。

外部のライブラリは使っていません。
