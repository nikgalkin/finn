import { KeyRound, ShieldAlert, X } from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import type { DatasourceSource } from '../../types';

type DsConfirmPluginModalProps = {
  source: DatasourceSource;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Asked once per path and hash, before Finn runs the first fetch. The manifest
 * command has already run so the dialog can describe the plugin; by contract it
 * is side-effect-free and does not use the network.
 *
 * It says plainly what the guarantee is: you deliberately installed this binary
 * and pinned it. A running plugin is an ordinary process with your rights, and
 * pretending otherwise would be the dishonest part.
 */
export function DsConfirmPluginModal({ source, confirming, onCancel, onConfirm }: DsConfirmPluginModalProps) {
  return (
    <ModalPortal onClose={confirming ? () => {} : onCancel} closeOnEscape={!confirming} className="cash-flow-modal-backdrop">
      <section
        className="glass-panel ds-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-confirm-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="cash-flow-period-header">
          <div>
            <h3 id="ds-confirm-title"><ShieldAlert size={18} /> Run “{source.name}” on this machine?</h3>
            <p>Finn is about to run this plugin&apos;s fetch command. Check that it is the program you installed.</p>
          </div>
          <button className="btn cash-flow-icon-button" onClick={onCancel} disabled={confirming} title="Close" aria-label="Close">
            <X size={17} />
          </button>
        </header>

        <div className="ds-confirm-body">
          <dl className="ds-confirm-facts">
            <dt>Path</dt>
            <dd><code>{source.path}</code></dd>
            <dt>sha256</dt>
            <dd>
              <code>{source.sha256}</code>
              <span className={source.pinned ? 'ds-chip is-ok' : 'ds-chip is-warn'}>
                {source.pinned ? 'pinned in config.yml' : 'not pinned'}
              </span>
            </dd>
            {source.manifest && (
              <>
                <dt>Plugin</dt>
                <dd>{source.manifest.name} {source.manifest.version} · handles {source.manifest.kinds.join(', ')}</dd>
              </>
            )}
          </dl>

          {!!source.manifest?.configKeys?.length && (
            <div className="ds-confirm-keys">
              <div className="ds-confirm-keys-title"><KeyRound size={15} /> What it asks for</div>
              <ul>
                {source.manifest.configKeys.map(key => (
                  <li key={key.key}>
                    <code>{key.key}</code>
                    {key.required && <span className="ds-chip is-warn">required</span>}
                    {key.secret && <span className="ds-chip is-danger">secret</span>}
                    {key.env && <small>via {key.env}</small>}
                    {key.note && <small>{key.note}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="ds-confirm-warning">
            Once started it is an ordinary process with your rights: it can read your files and reach the
            network, and Finn does not restrict that. What Finn does guarantee is that the plugin never
            touches your database — everything it returns waits in the Inbox until you accept it.
            {!source.pinned && ' Without sha256 in config.yml, replacing the file at this path is enough to change what runs.'}
          </p>
        </div>

        <footer className="ds-confirm-footer">
          <button className="btn" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Starting…' : 'Confirm and run'}
          </button>
        </footer>
      </section>
    </ModalPortal>
  );
}
