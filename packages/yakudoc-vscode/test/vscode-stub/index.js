// テストで `import "vscode"` を解決可能にするためだけの空スタブ。
// 実際の API はテスト側が node:test の mock.module で差し替える。
// VS Code 実行時はホストが本物の vscode を注入するため、これは使われない。
module.exports = {};
