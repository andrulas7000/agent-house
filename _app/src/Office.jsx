import { useEffect, useState } from 'react';
import { JOB_STATUSES } from './layout.js';

export const JOB_ROOMS = { puerto: 'El puerto', entrevistas: 'Sala de oficinas' };

/** Jobs' three places. At home: the CV and the doors out. At the port: the boat and the board. The office room needs nothing. */
export default function Office({ room, jobs, onAct, onRoom }) {
  const [panel, setPanel] = useState(null); // 'jobs', 'cv' or nothing
  const [error, setError] = useState('');
  const [cv, setCv] = useState(null);
  const [compiling, setCompiling] = useState(false);
  const [log, setLog] = useState('');
  const items = jobs?.items ?? [];
  const problem = error || (room === 'puerto' && !jobs?.busy ? jobs?.error : '');
  const run = async (body) => setError((await onAct(body)) ?? '');
  const toggle = (name) => setPanel((open) => (open === name ? null : name));

  const readCv = async () => setCv(await (await fetch('/api/jobs/cv')).json());
  useEffect(() => { if (panel === 'cv') readCv().catch(() => setError('El servidor local dejó de responder.')); }, [panel]);

  const compile = async () => {
    setCompiling(true);
    setError('');
    setLog('');
    try {
      const res = await fetch('/api/jobs/cv', { method: 'POST' });
      const reply = await res.json();
      if (!res.ok) {
        setError(reply.error);
        setLog(reply.log ?? '');
      }
      await readCv();
    } catch {
      setError('El servidor local dejó de responder.');
    }
    setCompiling(false);
  };

  if (room === 'entrevistas') return null;
  return (
    <div className="office">
      {room === 'puerto'
        ? (
          <nav className="office-menu" aria-label="El puerto">
            <button type="button" className="action" disabled={jobs?.busy} onClick={() => run({ action: 'hunt' })}>{jobs?.busy ? 'En el mar…' : 'Buscar empleo'}</button>
            <button type="button" className="plain" aria-pressed={panel === 'jobs'} onClick={() => toggle('jobs')}>Trabajos <small>{items.length}</small></button>
          </nav>
        )
        : (
          <nav className="office-menu" aria-label="Casa de Jobs">
            <button type="button" className="plain" aria-pressed={panel === 'cv'} onClick={() => toggle('cv')}>CV</button>
            <button type="button" className="plain" onClick={(e) => onRoom('puerto', e)}>Al puerto <small>buscar empleo</small></button>
            <button type="button" className="plain" onClick={(e) => onRoom('entrevistas', e)}>A la sala de oficinas <small>entrevista de prueba</small></button>
          </nav>
        )}
      {problem && <p className="refused" role="alert">{problem}</p>}

      {room === 'puerto' && panel === 'jobs' && (
        <section className="office-panel frame" aria-label="Trabajos encontrados">
          {items.length === 0 && <p className="quiet">{jobs?.busy ? 'Jobs salió en su barco a buscar trabajos.' : 'Todavía no hay trabajos. Dile a Jobs qué buscas y mándalo a buscar.'}</p>}
          <ul className="job-list">
            {items.map((job) => (
              <li key={job.url}>
                <a href={job.url} target="_blank" rel="noreferrer">{job.title}</a>
                <small>{[job.company, job.location, job.deadline && `Cierra: ${job.deadline}`].filter(Boolean).join(' · ')}</small>
                {job.summary && <p>{job.summary}</p>}
                <div className="job-tools">
                  <select aria-label={`Estado de ${job.title}`} value={job.status} onChange={(e) => run({ action: 'status', url: job.url, status: e.target.value })}>
                    {JOB_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" className="plain" onClick={() => run({ action: 'remove', url: job.url })}>Quitar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!room && panel === 'cv' && (
        <section className="office-panel frame" aria-label="CV">
          <div className="cv-head">
            <span>{cv?.tex ? 'Tu CV está en Jobs/cv/cv.tex' : 'Todavía no hay CV. Pídele a Jobs que lo escriba en LaTeX.'}</span>
            <button type="button" className="action" disabled={!cv?.tex || compiling} onClick={compile}>{compiling ? 'Compilando…' : 'Compilar PDF'}</button>
          </div>
          {log && <pre className="cv-log">{log}</pre>}
          {cv?.pdf && <iframe className="cv-pdf" title="Vista previa del CV" src={`/api/jobs/cv.pdf?v=${cv.pdf}`} />}
        </section>
      )}
    </div>
  );
}
