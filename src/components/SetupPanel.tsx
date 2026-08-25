import { useRef } from 'react';
import { cpmToWpm } from '../game/morse';
import { parseCallsignFile } from '../game/callsigns';
import type { RufzSettings } from '../game/settings';

interface Props {
  settings: RufzSettings;
  onChange: (settings: RufzSettings) => void;
  poolSize: number;
  poolLabel: string;
  onPoolImport: (calls: string[], label: string) => void;
  onPoolReset: () => void;
  onStart: () => void;
  onTestTone: () => void;
  /** Where recent runs settled, offered in place of the stored start speed. */
  suggestedStartCpm: number;
}

export function SetupPanel({
  settings,
  onChange,
  poolSize,
  poolLabel,
  onPoolImport,
  onPoolReset,
  onStart,
  onTestTone,
  suggestedStartCpm,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (fields: Partial<RufzSettings>) => onChange({ ...settings, ...fields });

  const auto = settings.autoStartCpm;
  const startCpm = auto ? suggestedStartCpm : settings.startCpm;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const calls = parseCallsignFile(await file.text());
    if (calls.length > 0) onPoolImport(calls, file.name);
  };

  return (
    <section className="panel">
      <h2>Setup</h2>

      <div className="field-grid">
        <label>
          <span>Start speed</span>
          <input
            type="number"
            min={25}
            max={735}
            step={5}
            disabled={auto}
            value={startCpm}
            onChange={(e) => patch({ startCpm: Number(e.target.value) })}
          />
          <small>
            {startCpm} cpm · {cpmToWpm(startCpm).toFixed(0)} wpm
            {auto && ' · from recent runs'}
          </small>
        </label>

        <label>
          <span>Calls per run</span>
          <input
            type="number"
            min={5}
            max={200}
            step={5}
            value={settings.callCount}
            onChange={(e) => patch({ callCount: Number(e.target.value) })}
          />
          <small>RufzXP uses 50</small>
        </label>

        <label>
          <span>Tone pitch</span>
          <input
            type="range"
            min={300}
            max={1200}
            step={10}
            value={settings.tone.frequencyHz}
            onChange={(e) =>
              patch({ tone: { ...settings.tone, frequencyHz: Number(e.target.value) } })
            }
          />
          <small>{settings.tone.frequencyHz} Hz</small>
        </label>

        <label>
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.tone.volume}
            onChange={(e) =>
              patch({ tone: { ...settings.tone, volume: Number(e.target.value) } })
            }
          />
          <small>{Math.round(settings.tone.volume * 100)}%</small>
        </label>

        <label>
          <span>Keying hardness</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={settings.tone.hardness}
            onChange={(e) =>
              patch({ tone: { ...settings.tone, hardness: Number(e.target.value) } })
            }
          />
          <small>{settings.tone.hardness === 0 ? 'soft' : settings.tone.hardness === 10 ? 'hard' : settings.tone.hardness}</small>
        </label>

        <label>
          <span>Speed step</span>
          <select
            value={settings.speedRule.mode}
            onChange={(e) =>
              patch({
                speedRule: {
                  ...settings.speedRule,
                  mode: e.target.value as 'fixed' | 'proportional',
                },
              })
            }
          >
            <option value="proportional">Proportional</option>
            <option value="fixed">Fixed</option>
          </select>
          <small>
            {settings.speedRule.mode === 'fixed'
              ? `${settings.speedRule.stepCpm} cpm per call`
              : `${Math.round(settings.speedRule.stepFraction * 100)}% of current speed, ` +
                `narrowing to ${Math.round(settings.speedRule.minStepFraction * 100)}%`}
          </small>
        </label>
      </div>

      <div className="toggles">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.autoStartCpm}
            onChange={(e) => patch({ autoStartCpm: e.target.checked })}
          />
          <span>Start where recent runs settled</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.fixedSpeed}
            onChange={(e) => patch({ fixedSpeed: e.target.checked })}
          />
          <span>Fixed speed (no adaptation)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.allowRepeat}
            onChange={(e) => patch({ allowRepeat: e.target.checked })}
          />
          <span>Allow repeat at half points</span>
        </label>
      </div>

      <div className="pool">
        <span>
          Callsigns: <strong>{poolSize.toLocaleString()}</strong> — {poolLabel}
        </span>
        <div className="pool-actions">
          <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>
            Import list
          </button>
          <button type="button" className="ghost" onClick={onPoolReset}>
            Reset
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.dta,.ped,text/plain"
          hidden
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={onStart}>
          Start run
        </button>
        <button type="button" className="ghost" onClick={onTestTone}>
          Test tone
        </button>
      </div>
    </section>
  );
}
