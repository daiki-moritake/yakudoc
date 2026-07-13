/**
 * transformers.js の progress_callback が送ってくるイベント(の使う部分)。
 * 公開型が無いため必要なフィールドだけ緩く受ける。
 */
export interface DownloadProgressEvent {
  status?: string;
  file?: string;
  /** 0〜100 のパーセント値 */
  progress?: number;
  loaded?: number;
  total?: number;
}

/** これ未満のファイル(tokenizer の JSON など)は一瞬で終わるため報告しない */
const MIN_REPORT_BYTES = 1024 * 1024;

/** 報告する進捗の刻み(%)。細かすぎるとログが流れて読めなくなる */
const STEP_PERCENT = 10;

function toMb(bytes: number | undefined): string {
  return ((bytes ?? 0) / (1024 * 1024)).toFixed(1);
}

/**
 * ダウンロード進捗イベントを人間向けの行に間引いて整形する。
 *
 * 初回のモデル取得は数百 MB〜1GB 超あり、無反応だとフリーズと
 * 誤解されて中断されがちなので、1MB 以上のファイルについて
 * 10% 刻みで進捗を emit する。キャッシュ済みなら何も出ない。
 */
export function createProgressRenderer(
  emit: (message: string) => void
): (event: DownloadProgressEvent) => void {
  const lastStep = new Map<string, number>();
  return (event) => {
    if (event.status !== "progress" || !event.file) {
      return;
    }
    if ((event.total ?? 0) < MIN_REPORT_BYTES) {
      return;
    }
    const step = Math.floor((event.progress ?? 0) / STEP_PERCENT);
    if (step <= (lastStep.get(event.file) ?? -1)) {
      return;
    }
    lastStep.set(event.file, step);
    emit(
      `ダウンロード中: ${event.file} ${Math.min(step * STEP_PERCENT, 100)}%` +
        `(${toMb(event.loaded)} / ${toMb(event.total)} MB)`
    );
  };
}
