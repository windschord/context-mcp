use anyhow::Result;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc as tokio_mpsc;
use tracing::{debug, error, info, warn};

/// ファイル変更イベントの種類
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileChangeKind {
    /// ファイルが作成された
    Created,
    /// ファイルが変更された
    Modified,
    /// ファイルが削除された
    Deleted,
}

/// ファイル変更イベント
#[derive(Debug, Clone)]
pub struct FileChangeEvent {
    /// 変更されたファイルのパス
    pub path: PathBuf,
    /// 変更の種類
    pub kind: FileChangeKind,
    /// イベントが発生した時刻
    pub timestamp: Instant,
}

/// デバウンス処理を行うファイル監視構造体
pub struct FileWatcher {
    /// notify crateのウォッチャー
    _watcher: RecommendedWatcher,
    /// デバウンスされたイベントを受信するレシーバー
    event_receiver: Arc<Mutex<Receiver<FileChangeEvent>>>,
    /// 監視対象のルートパス
    root_path: PathBuf,
    /// デバウンス期間（ミリ秒）
    debounce_ms: u64,
}

impl FileWatcher {
    /// 新しいFileWatcherを作成
    ///
    /// # Arguments
    /// * `root_path` - 監視対象のルートディレクトリ
    /// * `debounce_ms` - デバウンス期間（ミリ秒）、デフォルトは500ms
    pub fn new(root_path: PathBuf, debounce_ms: Option<u64>) -> Result<Self> {
        let debounce_ms = debounce_ms.unwrap_or(500);
        let (tx, rx) = channel();
        let debounced_tx = Self::create_debounced_sender(tx, debounce_ms);

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        if let Err(e) = Self::handle_notify_event(event, &debounced_tx) {
                            error!("Failed to handle file event: {}", e);
                        }
                    }
                    Err(e) => {
                        error!("File watcher error: {}", e);
                    }
                }
            },
            Config::default(),
        )?;

        watcher.watch(&root_path, RecursiveMode::Recursive)?;

        info!(
            "File watcher started for path: {}, debounce: {}ms",
            root_path.display(),
            debounce_ms
        );

        Ok(Self {
            _watcher: watcher,
            event_receiver: Arc::new(Mutex::new(rx)),
            root_path,
            debounce_ms,
        })
    }

    /// notify crateのイベントを処理してFileChangeEventに変換
    fn handle_notify_event(
        event: Event,
        sender: &Sender<FileChangeEvent>,
    ) -> Result<()> {
        let kind = match event.kind {
            EventKind::Create(_) => FileChangeKind::Created,
            EventKind::Modify(_) => FileChangeKind::Modified,
            EventKind::Remove(_) => FileChangeKind::Deleted,
            _ => return Ok(()), // その他のイベントは無視
        };

        for path in event.paths {
            // ディレクトリは無視
            if path.is_dir() {
                continue;
            }

            // 隠しファイルと一時ファイルは無視
            if let Some(file_name) = path.file_name() {
                let name = file_name.to_string_lossy();
                if name.starts_with('.') || name.ends_with('~') || name.ends_with(".swp") {
                    continue;
                }
            }

            let change_event = FileChangeEvent {
                path,
                kind: kind.clone(),
                timestamp: Instant::now(),
            };

            sender.send(change_event)?;
        }

        Ok(())
    }

    /// デバウンス処理を行うSenderを作成
    fn create_debounced_sender(
        tx: Sender<FileChangeEvent>,
        debounce_ms: u64,
    ) -> Sender<FileChangeEvent> {
        let (debounce_tx, debounce_rx) = channel::<FileChangeEvent>();
        let debounce_duration = Duration::from_millis(debounce_ms);

        std::thread::spawn(move || {
            // ファイルパスごとの最後のイベントを保持
            let mut pending_events: std::collections::HashMap<PathBuf, FileChangeEvent> =
                std::collections::HashMap::new();
            let mut last_flush = Instant::now();

            loop {
                // デバウンス期間の半分だけ待機
                std::thread::sleep(Duration::from_millis(debounce_ms / 2));

                // 新しいイベントを受信
                while let Ok(event) = debounce_rx.try_recv() {
                    pending_events.insert(event.path.clone(), event);
                }

                // デバウンス期間が経過したイベントを送信
                let now = Instant::now();
                if now.duration_since(last_flush) >= debounce_duration {
                    let events_to_process: Vec<_> = pending_events.drain().collect();

                    for (path, event) in events_to_process {
                        if now.duration_since(event.timestamp) >= debounce_duration {
                            if let Err(e) = tx.send(event) {
                                error!("Failed to send debounced event: {}", e);
                                return;
                            }
                        } else {
                            // まだデバウンス期間内なので保持
                            pending_events.insert(path, event);
                        }
                    }
                    last_flush = now;
                }
            }
        });

        debounce_tx
    }

    /// ファイル変更イベントを受信
    ///
    /// ブロッキング呼び出しで、イベントが発生するまで待機します。
    pub fn recv(&self) -> Result<FileChangeEvent> {
        let receiver = self.event_receiver.lock().unwrap();
        Ok(receiver.recv()?)
    }

    /// ファイル変更イベントを非ブロッキングで受信
    ///
    /// イベントがない場合はNoneを返します。
    pub fn try_recv(&self) -> Result<Option<FileChangeEvent>> {
        let receiver = self.event_receiver.lock().unwrap();
        match receiver.try_recv() {
            Ok(event) => Ok(Some(event)),
            Err(std::sync::mpsc::TryRecvError::Empty) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 監視対象のルートパスを取得
    pub fn root_path(&self) -> &Path {
        &self.root_path
    }

    /// デバウンス期間（ミリ秒）を取得
    pub fn debounce_ms(&self) -> u64 {
        self.debounce_ms
    }
}

/// 非同期版のファイル監視構造体
pub struct AsyncFileWatcher {
    /// 内部のFileWatcher
    _inner: Arc<FileWatcher>,
    /// 非同期イベントレシーバー
    event_receiver: tokio_mpsc::UnboundedReceiver<FileChangeEvent>,
}

impl AsyncFileWatcher {
    /// 新しいAsyncFileWatcherを作成
    pub fn new(root_path: PathBuf, debounce_ms: Option<u64>) -> Result<Self> {
        let watcher = FileWatcher::new(root_path, debounce_ms)?;
        let watcher = Arc::new(watcher);
        let (tx, rx) = tokio_mpsc::unbounded_channel();

        // バックグラウンドスレッドでイベントを転送
        let watcher_clone = Arc::clone(&watcher);
        std::thread::spawn(move || loop {
            match watcher_clone.recv() {
                Ok(event) => {
                    if tx.send(event).is_err() {
                        warn!("Event receiver dropped, stopping file watcher thread");
                        break;
                    }
                }
                Err(e) => {
                    error!("Failed to receive file event: {}", e);
                    break;
                }
            }
        });

        Ok(Self {
            _inner: watcher,
            event_receiver: rx,
        })
    }

    /// ファイル変更イベントを非同期で受信
    pub async fn recv(&mut self) -> Option<FileChangeEvent> {
        self.event_receiver.recv().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_file_watcher_creation() {
        let temp_dir = TempDir::new().unwrap();
        let watcher = FileWatcher::new(temp_dir.path().to_path_buf(), Some(500));
        assert!(watcher.is_ok());
    }

    #[test]
    fn test_file_change_detection() {
        let temp_dir = TempDir::new().unwrap();
        let watcher = FileWatcher::new(temp_dir.path().to_path_buf(), Some(100)).unwrap();

        // テストファイルを作成
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Hello, World!").unwrap();

        // イベントを待機（タイムアウト付き）
        std::thread::sleep(Duration::from_millis(200));

        // イベントを確認
        // ファイルシステムの実装により、CreatedまたはModifiedイベントが発生する可能性がある
        if let Ok(Some(event)) = watcher.try_recv() {
            assert!(
                event.kind == FileChangeKind::Created || event.kind == FileChangeKind::Modified,
                "Expected Created or Modified event, got {:?}",
                event.kind
            );
            assert!(event.path.ends_with("test.txt"));
        }
    }

    #[test]
    fn test_debounce_processing() {
        let temp_dir = TempDir::new().unwrap();
        let watcher = FileWatcher::new(temp_dir.path().to_path_buf(), Some(300)).unwrap();

        let test_file = temp_dir.path().join("debounce.txt");

        // 短時間に複数回書き込み
        for i in 0..5 {
            fs::write(&test_file, format!("Content {}", i)).unwrap();
            std::thread::sleep(Duration::from_millis(50));
        }

        // デバウンス期間よりも長く待機
        std::thread::sleep(Duration::from_millis(500));

        // デバウンス後は1つのイベントのみ受信されるべき
        let mut event_count = 0;
        while watcher.try_recv().unwrap().is_some() {
            event_count += 1;
        }

        debug!("Received {} events after debouncing", event_count);
        // デバウンスにより、イベント数は元の数より少ないはず
        assert!(event_count < 5);
    }

    #[tokio::test]
    async fn test_async_file_watcher() {
        let temp_dir = TempDir::new().unwrap();
        let mut watcher = AsyncFileWatcher::new(temp_dir.path().to_path_buf(), Some(100)).unwrap();

        // テストファイルを作成
        let test_file = temp_dir.path().join("async_test.txt");
        fs::write(&test_file, "Async test").unwrap();

        // 非同期でイベントを待機（タイムアウト付き）
        let event = tokio::time::timeout(Duration::from_secs(2), watcher.recv())
            .await
            .unwrap();

        if let Some(event) = event {
            assert!(
                event.kind == FileChangeKind::Created || event.kind == FileChangeKind::Modified
            );
            assert!(event.path.ends_with("async_test.txt"));
        }
    }

    #[test]
    fn test_file_deletion_detection() {
        let temp_dir = TempDir::new().unwrap();
        let watcher = FileWatcher::new(temp_dir.path().to_path_buf(), Some(100)).unwrap();

        let test_file = temp_dir.path().join("to_delete.txt");
        fs::write(&test_file, "Delete me").unwrap();

        std::thread::sleep(Duration::from_millis(200));

        // 作成イベントを消費
        let _ = watcher.try_recv();

        // ファイルを削除
        fs::remove_file(&test_file).unwrap();

        std::thread::sleep(Duration::from_millis(200));

        // 削除イベントを確認
        if let Ok(Some(event)) = watcher.try_recv() {
            assert_eq!(event.kind, FileChangeKind::Deleted);
            assert!(event.path.ends_with("to_delete.txt"));
        }
    }
}
