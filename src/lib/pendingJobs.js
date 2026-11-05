const PENDING_KEY = 'kie_pending_jobs';

export function savePendingJob(job) {
    try {
        const jobs = getAllPendingJobs().filter(j => j.requestId !== job.requestId);
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

export function getPendingJobs(studioType) {
    const all = getAllPendingJobs();
    return studioType ? all.filter(j => j.studioType === studioType) : all;
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

        const queueRequest = (rid) => {
            if (queued) return;
            queued = true;
            requestId = rid || null;
            if (requestId) savePendingJob({ requestId, studioType, historyMeta, maxAttempts, interval, submittedAt: Date.now() });
            resolveQueued(requestId);
        };

        const finish = () => {
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
