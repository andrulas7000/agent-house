import { useEffect, useState } from 'react';
import { JOB_STATUSES } from './layout.js';

export const JOB_ROOMS = { port: 'The port', interviews: 'Office room' };

/** Jobs' three places. At home: the CV and the doors out. At the port: the boat and the board. The office room needs nothing. */
export default function Office({ room, jobs, onAct, onRoom }) {
  const [panel, setPanel] = useState(null); // 'jobs', 'cv' or nothing
  const [error, setError] = useState('');
  const [cv, setCv] = useState(null);
  const [compiling, setCompiling] = useState(false);
  const [log, setLog] = useState('');
  const items = jobs?.items ?? [];
  const problem = error || (room === 'port' && !jobs?.busy ? jobs?.error : '');
  const run = async (body) => setError((await onAct(body)) ?? '');
  const toggle = (name) => setPanel((open) => (open === name ? null : name));

  const readCv = async () => setCv(await (await fetch('/api/jobs/cv')).json());
  useEffect(() => { if (panel === 'cv') readCv().catch(() => setError('The local server stopped responding.')); }, [panel]);

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
      setError('The local server stopped responding.');
    }
    setCompiling(false);
  };

  if (room === 'interviews') return null;
  return (
    <div className="office">
      {room === 'port'
        ? (
          <nav className="office-menu" aria-label="The port">
            <button type="button" className="action" disabled={jobs?.busy} onClick={() => run({ action: 'hunt' })}>{jobs?.busy ? 'At sea…' : 'Find openings'}</button>
            <button type="button" className="plain" aria-pressed={panel === 'jobs'} onClick={() => toggle('jobs')}>Openings <small>{items.length}</small></button>
          </nav>
        )
        : (
          <nav className="office-menu" aria-label="Jobs' house">
            <button type="button" className="plain" aria-pressed={panel === 'cv'} onClick={() => toggle('cv')}>CV</button>
            <button type="button" className="plain" onClick={(e) => onRoom('port', e)}>To the port <small>find openings</small></button>
            <button type="button" className="plain" onClick={(e) => onRoom('interviews', e)}>To the office room <small>mock interview</small></button>
          </nav>
        )}
      {problem && <p className="refused" role="alert">{problem}</p>}

      {room === 'port' && panel === 'jobs' && (
        <section className="office-panel frame" aria-label="Openings found">
          {items.length === 0 && <p className="quiet">{jobs?.busy ? 'Jobs is out on the boat looking for openings.' : 'No openings yet. Tell Jobs what you\'re looking for and send it out.'}</p>}
          <ul className="job-list">
            {items.map((job) => (
              <li key={job.url}>
                <a href={job.url} target="_blank" rel="noreferrer">{job.title}</a>
                <small>{[job.company, job.location, job.deadline && `Closes: ${job.deadline}`].filter(Boolean).join(' · ')}</small>
                {job.summary && <p>{job.summary}</p>}
                <div className="job-tools">
                  <select aria-label={`Status of ${job.title}`} value={job.status} onChange={(e) => run({ action: 'status', url: job.url, status: e.target.value })}>
                    {JOB_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" className="plain" onClick={() => run({ action: 'remove', url: job.url })}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!room && panel === 'cv' && (
        <section className="office-panel frame" aria-label="CV">
          <div className="cv-head">
            <span>{cv?.tex ? 'Your CV is in Jobs/cv/cv.tex' : 'No CV yet. Ask Jobs to write it in LaTeX.'}</span>
            <button type="button" className="action" disabled={!cv?.tex || compiling} onClick={compile}>{compiling ? 'Compiling…' : 'Compile PDF'}</button>
          </div>
          {log && <pre className="cv-log">{log}</pre>}
          {cv?.pdf && <iframe className="cv-pdf" title="CV preview" src={`/api/jobs/cv.pdf?v=${cv.pdf}`} />}
        </section>
      )}
    </div>
  );
}
