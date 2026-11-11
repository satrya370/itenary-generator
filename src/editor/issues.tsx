import React, { createContext, useContext } from 'react';

export interface IssuesApi {
  issueFor: (key: string) => string | null;
  touch: (key: string) => void;
}

export const IssuesContext = createContext<IssuesApi>({ issueFor: () => null, touch: () => {} });
export const ScopeContext = createContext<string>('');

export function ItemScope({ id, children }: { id: string; children: React.ReactNode }) {
  return <ScopeContext.Provider value={id}>{children}</ScopeContext.Provider>;
}

export function useIssue(path: string) {
  const api = useContext(IssuesContext);
  const scope = useContext(ScopeContext);
  const key = `${scope}|${path}`;
  const message = api.issueFor(key);
  return {
    message,
    inputProps: {
      onBlur: () => api.touch(key),
      'aria-invalid': message ? (true as const) : undefined
    }
  };
}

export function IssueText({ id, message }: { id: string; message: string | null }) {
  return message ? <p id={id} className="mt-1 text-xs text-red-700">{message}</p> : null;
}
