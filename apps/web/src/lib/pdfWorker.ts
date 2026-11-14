import { configurePdfWorker } from '@cifras/pdf';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

configurePdfWorker(workerUrl);
