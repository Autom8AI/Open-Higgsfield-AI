const PENDING_KEY = 'kie_pending_jobs';
const LOCAL_PREFIX = 'local:';

export function savePendingJob(job) {
    try {
        const now = Date.now();
        // Drop leftovers: unsubmitted local jobs after 5 min, anything after 6 h.
        const jobs = getAllPendingJobs().filter(j => j.requestId !== job.requestId
            && now - (j.submittedAt || 0) < 6 * 60 * 60 * 1000
            && !(String(j.requestId).startsWith(LOCAL_PREFIX) && now - (j.submittedAt || 0) > 5 * 60 * 1000));
        jobs.push(job);
        localStorage.setItem(PENDING_KEY, JSON.stringify(jobs));
    } catch (e) {
        console.warn('[PendingJobs] Failed to save:', e);
    }
}

export function removePendingJob(requestId) {
    try {
        const jobs = getAllPendingJobs().filter(j => j.requestId !== requestId);
        localStorage.setItem(PENDING_KEY, JSON.stringify(jobs));
    } catch (e) {
        console.warn('[PendingJobs] Failed to remove:', e);
    }
}

// Jobs that can be resumed after a reload (already accepted by the provider).
export function getPendingJobs(studioType) {
    const all = getAllPendingJobs().filter(j => !String(j.requestId).startsWith(LOCAL_PREFIX));
    return studioType ? all.filter(j => j.studioType === studioType) : all;
}

// Everything in flight, including jobs still being submitted. The Library uses
// this to show a card the moment Generate is clicked.
export function getInFlightJobs() {
    return getAllPendingJobs().filter(j => Date.now() - (j.submittedAt || 0) < 30 * 60 * 1000);
}

function getAllPendingJobs() {
    try {
        return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    } catch {
        return [];
    }
}

// Runs a generation without holding the caller's UI. `run(queueRequest)` must call
// `queueRequest(requestId)` once the provider has accepted the job. The returned
// promise resolves at that point, so the studio button can reset while polling
// continues in the background. `onDone` / `onFail` fire when polling finishes.
// Rejects only if the job never got queued.
export function startGenerationJob({ studioType, historyMeta, maxAttempts = 300, interval = 2000 }, run, { onDone, onFail } = {}) {
    return new Promise((resolveQueued, rejectQueued) => {
        let queued = false;
        let requestId = null;
        // Visible to the Library immediately, before the provider has answered.
        const localId = `${LOCAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const submittedAt = Date.now();
        savePendingJob({ requestId: localId, studioType, historyMeta, maxAttempts, interval, submittedAt });

        const queueRequest = (rid) => {
            if (queued) return;
            queued = true;
            requestId = rid || null;
            removePendingJob(localId);
            if (requestId) savePendingJob({ requestId, studioType, historyMeta, maxAttempts, interval, submittedAt });
            resolveQueued(requestId);
        };

        const finish = () => {
            removePendingJob(localId);
            if (requestId) removePendingJob(requestId);
        };

        Promise.resolve()
            .then(() => run(queueRequest))
            .then(
                (result) => {
                    queueRequest(null);
                    finish();
                    onDone?.(result);
                },
                (error) => {
                    finish();
                    if (queued) onFail?.(error);
                    else rejectQueued(error);
                }
            );
    });
}
