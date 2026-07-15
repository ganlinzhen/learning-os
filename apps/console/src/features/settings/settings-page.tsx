import { FormEvent, useEffect, useRef, useState } from "react";
import type { LlmSettingsDto, UpdateLlmSettingsDto } from "@learning-os/contracts";
import { apiClient } from "../../shared/api/api-client";

type SubmitAction = "save" | "test";

interface FieldErrors {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getConnectionErrorMessage(code: string): string {
  switch (code) {
    case "deepseek_auth_failed":
      return "API Key 无效或没有访问权限。";
    case "deepseek_model_or_request_failed":
      return "模型名称或服务地址不可用，请检查配置。";
    case "deepseek_network_failed":
      return "无法连接到服务，请检查地址和网络。";
    case "deepseek_response_invalid":
      return "服务返回了无法识别的响应，请检查服务兼容性。";
    case "deepseek_not_configured":
      return "尚未配置 API Key，请填写后重试。";
    default:
      return "连接测试失败，请检查 API Key、地址和模型名称后重试。";
  }
}

function isApiRequestError(error: unknown): error is { code: string; settings?: LlmSettingsDto } {
  return Boolean(error && typeof error === "object" && "code" in error && typeof error.code === "string");
}

export function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearErrorMessage, setClearErrorMessage] = useState("");
  const clearDialogRef = useRef<HTMLDialogElement>(null);

  const applySettings = (settings: LlmSettingsDto) => {
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
    setApiKeyConfigured(settings.apiKeyConfigured);
    setApiKey("");
  };

  useEffect(() => {
    let active = true;

    apiClient
      .getLlmSettings()
      .then((settings) => {
        if (active) {
          applySettings(settings);
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage("无法读取配置，请检查本地服务后重试。");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const dialog = clearDialogRef.current;
    if (!dialog) {
      return;
    }

    if (clearDialogOpen && !dialog.open) {
      dialog.showModal();
    }
    if (!clearDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [clearDialogOpen]);

  const createPayload = (): UpdateLlmSettingsDto | null => {
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModel = model.trim();
    const trimmedApiKey = apiKey.trim();
    const nextErrors: FieldErrors = {
      ...(!apiKeyConfigured && !trimmedApiKey ? { apiKey: "请填写 API Key。" } : {}),
      ...(!isHttpUrl(trimmedBaseUrl) ? { baseUrl: "请输入有效的 HTTP(S) 地址。" } : {}),
      ...(!trimmedModel ? { model: "请输入模型名称。" } : {}),
    };

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return null;
    }

    return {
      ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
      baseUrl: trimmedBaseUrl,
      model: trimmedModel,
    };
  };

  const submitSettings = async (action: SubmitAction) => {
    const payload = createPayload();
    if (!payload) {
      return;
    }

    setPending(true);
    setMessage("");
    setErrorMessage("");
    try {
      const settings =
        action === "test" ? await apiClient.testLlmSettings(payload) : await apiClient.saveLlmSettings(payload);
      applySettings(settings);
      setMessage(action === "test" ? "连接测试成功。" : "配置已保存。");
    } catch (error) {
      if (action === "test" && isApiRequestError(error) && error.settings) {
        applySettings(error.settings);
      }
      setErrorMessage(
        action === "test"
          ? getConnectionErrorMessage(isApiRequestError(error) ? error.code : "")
          : "保存失败，请检查配置后重试。",
      );
    } finally {
      setPending(false);
    }
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitSettings("save");
  };

  const clearApiKey = async () => {
    setPending(true);
    setMessage("");
    setErrorMessage("");
    setClearErrorMessage("");
    try {
      applySettings(await apiClient.clearLlmApiKey());
      setClearDialogOpen(false);
      setMessage("API Key 已清除。");
    } catch {
      setClearErrorMessage("清除 API Key 失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="page settings-page">
      <header className="settings-page-header">
        <h1>设置</h1>
        <p>管理本机的模型连接配置。</p>
      </header>

      {loading ? <p role="status">正在读取配置…</p> : null}
      {errorMessage ? <p className="settings-message settings-message-error" role="alert">{errorMessage}</p> : null}
      {message ? <p className="settings-message settings-message-success" role="status">{message}</p> : null}

      {!loading ? (
        <section aria-labelledby="llm-settings-heading" className="settings-section">
          <div className="settings-section-heading">
            <h2 id="llm-settings-heading">LLM 配置</h2>
            <p>DeepSeek</p>
          </div>

          <form className="settings-panel" noValidate onSubmit={onSave}>
            <div className="settings-row">
              <div className="settings-row-copy">
                <label htmlFor="api-key">API Key</label>
                <p>出于安全考虑，已保存的密钥不会再次显示。</p>
              </div>
              <div className="settings-row-control">
                <div className="settings-key-status" aria-live="polite">
                  <span>{apiKeyConfigured ? "已配置" : "未配置"}</span>
                  {apiKeyConfigured ? (
                    <button disabled={pending} onClick={() => { setClearErrorMessage(""); setClearDialogOpen(true); }} type="button">
                      清除 API Key
                    </button>
                  ) : null}
                </div>
                <input
                  aria-describedby={fieldErrors.apiKey ? "api-key-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.apiKey)}
                  autoComplete="off"
                  id="api-key"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={apiKeyConfigured ? "输入新密钥以替换当前配置" : "请输入 DeepSeek API Key"}
                  type="password"
                  value={apiKey}
                />
                {fieldErrors.apiKey ? <p className="field-error" id="api-key-error">{fieldErrors.apiKey}</p> : null}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-copy">
                <label htmlFor="base-url">Base URL</label>
                <p>请求将发送到此服务地址。</p>
              </div>
              <div className="settings-row-control">
                <input
                  aria-describedby={fieldErrors.baseUrl ? "base-url-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.baseUrl)}
                  id="base-url"
                  onChange={(event) => setBaseUrl(event.target.value)}
                  type="url"
                  value={baseUrl}
                />
                {fieldErrors.baseUrl ? <p className="field-error" id="base-url-error">{fieldErrors.baseUrl}</p> : null}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-copy">
                <label htmlFor="model">模型名称</label>
                <p>用于整理和复习内容的模型。</p>
              </div>
              <div className="settings-row-control">
                <input
                  aria-describedby={fieldErrors.model ? "model-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.model)}
                  id="model"
                  onChange={(event) => setModel(event.target.value)}
                  type="text"
                  value={model}
                />
                {fieldErrors.model ? <p className="field-error" id="model-error">{fieldErrors.model}</p> : null}
              </div>
            </div>

            <div className="settings-actions">
              <button disabled={pending} type="submit">{pending ? "保存中…" : "保存配置"}</button>
              <button disabled={pending} onClick={() => void submitSettings("test")} type="button">
                保存并测试连接
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <dialog
        aria-labelledby="clear-api-key-title"
        className="settings-dialog"
        onCancel={(event) => { event.preventDefault(); setClearDialogOpen(false); }}
        onClose={() => { setClearErrorMessage(""); setClearDialogOpen(false); }}
        ref={clearDialogRef}
      >
        <form method="dialog" onSubmit={(event) => { event.preventDefault(); void clearApiKey(); }}>
          <h2 id="clear-api-key-title">清除 API Key？</h2>
          <p>清除后，后续模型请求将无法使用当前密钥，直到重新保存新的密钥。</p>
          {clearErrorMessage ? <p className="settings-message settings-message-error" role="alert">{clearErrorMessage}</p> : null}
          <div className="settings-dialog-actions">
            <button disabled={pending} onClick={() => setClearDialogOpen(false)} type="button">取消</button>
            <button disabled={pending} type="submit">确认清除</button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
