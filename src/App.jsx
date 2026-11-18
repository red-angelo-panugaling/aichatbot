import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  FileText,
  GraduationCap,
  RotateCcw,
  Send,
  User,
} from 'lucide-react';

const welcomeMessage = name => ({
  role: 'model',
  text: `Hello! Ask me about ${name}. I will answer using that document.`,
  isWelcome: true,
});

const quickPrompts = [
  'Summarize this PDF in 5 points',
  'What are the main topics?',
  'What questions can this PDF answer?',
];

export default function CampusChatbot() {
  const [documents, setDocuments] = useState([]);
  const [limits, setLimits] = useState({ maxPages: 400, maxSizeMb: 10 });
  const [selectedDocument, setSelectedDocument] = useState('');
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [documentsError, setDocumentsError] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([welcomeMessage('the campus handbook')]);
  const sendingRef = useRef(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    fetch('/api/documents')
      .then(async response => {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`PDF list service returned HTTP ${response.status}. Restart the dev server and try again.`);
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load PDFs.');
        const availableDocuments = data.documents || [];
        setDocuments(availableDocuments);
        if (data.limits) setLimits(data.limits);
        if (availableDocuments.length) {
          const initialDocument = availableDocuments.find(item => item.name === 'campus-handbook.pdf')
            || availableDocuments[0];
          setSelectedDocument(initialDocument.name);
          setMessages([welcomeMessage(initialDocument.name)]);
        } else {
          setDocumentsError('No PDF files found in the documents folder.');
        }
      })
      .catch(err => setDocumentsError(err.message || 'Unable to load PDFs.'))
      .finally(() => setIsLoadingDocuments(false));
  }, []);

  const documentName = selectedDocument;
  const selectedPdf = documents.find(pdf => pdf.name === selectedDocument);
  const selectedPdfTooLong = Boolean(selectedPdf?.tooLong);

  const switchDocument = name => {
    if (sendingRef.current) return;
    setSelectedDocument(name);
    setMessages([welcomeMessage(name)]);
    setError(null);
  };

  const handleSend = async customText => {
    const question = (customText ?? input).trim();
    if (!question || sendingRef.current || selectedPdfTooLong) return;

    sendingRef.current = true;
    setError(null);
    setIsLoading(true);

    // Do not send the synthetic greeting as chat history.
    const history = messages
      .filter(message => !message.isWelcome)
      .slice(-12)
      .map(({ role, text }) => ({ role, text }));

    setMessages(previous => [...previous, { role: 'user', text: question }]);
    setInput('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history, document: selectedDocument }),
        signal: AbortSignal.timeout(180_000),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      if (!data.reply || typeof data.reply !== 'string') {
        throw new Error('The AI returned an empty response.');
      }
      setMessages(previous => [...previous, { role: 'model', text: data.reply }]);
    } catch (err) {
      setError(err.name === 'TimeoutError'
        ? 'The PDF is taking too long to process. Please try your question again.'
        : err.message || 'Unable to connect to the chatbot.');
      setMessages(previous => previous.slice(0, -1));
      setInput(question);
    } finally {
      sendingRef.current = false;
      setIsLoading(false);
    }
  };

  const resetChat = () => {
    if (sendingRef.current) return;
    setMessages([welcomeMessage(documentName)]);
    setInput('');
    setError(null);
  };

  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-indigo-600" />
          <h1 className="text-base font-semibold text-indigo-600">CampusGuide AI</h1>
        </div>

        <button
          type="button"
          onClick={resetChat}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New Chat
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <p className="font-semibold">PDF assistant</p>
            <p className="mt-1 text-xs text-indigo-700">
              Ask your own questions or follow up naturally. Answers use the selected PDF as their source.
            </p>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <label htmlFor="pdf-choice" className="text-sm font-semibold text-slate-800">Choose a reference PDF</label>
              <span className="text-xs text-slate-500">{documents.length} available</span>
            </div>
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-600" />
              <select
                id="pdf-choice"
                value={selectedDocument}
                disabled={isLoadingDocuments || isLoading || documents.length === 0}
                onChange={event => switchDocument(event.target.value)}
                className="w-full appearance-none rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-800 outline-none transition hover:border-indigo-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="" disabled>
                  {isLoadingDocuments ? 'Loading PDFs…' : documents.length ? 'Select a PDF' : 'No PDFs available'}
                </option>
                {documents.map(document => (
                  <option key={document.name} value={document.name}>
                    {document.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ')}
                    {document.pages !== null ? ` · ${document.pages} pages` : ''}
                    {document.tooLong ? ' · over limit' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
            {documentsError && (
              <p role="alert" className="mt-2 text-xs text-red-600">{documentsError}</p>
            )}
            {selectedPdfTooLong && (
              <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                This PDF is too long to use. The chatbot limit is {limits.maxPages} pages or {limits.maxSizeMb} MB. Choose a shorter PDF from the list.
              </p>
            )}
            {selectedDocument && !documentsError && !selectedPdfTooLong && (
              <p className="mt-2 text-xs text-slate-500">Chat answers will use <span className="font-medium text-slate-700">{selectedDocument}</span>.</p>
            )}
          </section>

          <div className="space-y-4 pt-2">
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={`${index}-${message.role}`}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isUser ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white shadow-xs'
                    }`}
                  >
                    {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                      isUser
                        ? 'rounded-tr-none bg-indigo-600 text-white'
                        : 'rounded-tl-none border border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words">{message.text}</span>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-slate-200 bg-white px-4 py-3 shadow-xs">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0.4s]" />
                  <span className="ml-2 text-xs font-medium text-slate-400">Reading the PDF and generating a response...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </main>

      <div className="bg-slate-50 px-6 py-2">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Try asking:</span>
          {quickPrompts.map(prompt => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSend(prompt)}
              disabled={isLoading || !selectedDocument || selectedPdfTooLong}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <textarea
            rows={1}
            maxLength={1000}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !selectedDocument || selectedPdfTooLong}
            placeholder={selectedPdfTooLong ? 'This PDF exceeds the chatbot limit. Choose another PDF.' : selectedDocument ? 'Ask anything about the PDF. Follow-up questions are welcome…' : 'Choose a PDF to start chatting...'}
            aria-label="Ask a question about the PDF"
            className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={isLoading || !selectedDocument || selectedPdfTooLong || !input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
            Responses are generated from {documentName}.
        </p>
      </footer>
    </div>
  );
}
