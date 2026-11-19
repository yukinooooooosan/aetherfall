# Three.js版の更新とGitHub Pages公開

`main` にpushすると、GitHub Actionsの「Deploy game to GitHub Pages」がモデルテストと城門迎撃戦のブラウザテストを実行する。テストに通った `dist/` をPagesに公開し、公開URLでもブラウザテストを実行する。

公開結果はワークフローの実行結果とデプロイ先URLで確認する。公開できなかった場合は、失敗した段階と必要な対応を伝える。
