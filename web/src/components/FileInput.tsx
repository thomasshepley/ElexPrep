import { useRef, useState } from 'react';

export default function FileInput({
  accept,
  disabled,
  onFile,
  label = 'Choose file',
  persistName = false,
}: {
  accept?: string;
  disabled?: boolean;
  onFile: (file: File) => void | Promise<void>;
  label?: string;
  /** For pickers that only select a file to send later (a form) rather than uploading it now:
   * keep showing the chosen file's name. */
  persistName?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handle = async (file: File) => {
    setFileName(file.name);
    try {
      await onFile(file);
    } finally {
      // Cleared after each pick so choosing the same file again (e.g. after an upload error)
      // still fires onChange, and the name doesn't linger once the upload is done.
      if (inputRef.current) inputRef.current.value = '';
      if (!persistName) setFileName(null);
    }
  };

  return (
    <div className="file-input">
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept={accept}
        disabled={disabled}
        className="file-input-native"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
        }}
      />
      <button type="button" className="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <span className="file-input-name" aria-live="polite">
        {fileName ? (persistName ? fileName : `${fileName}…`) : 'No file chosen'}
      </span>
    </div>
  );
}
