/**
 * Who opens the enquiry popup.
 *
 * A three-line event bus rather than a context provider, because the openers
 * and the dialog have nothing to say to each other beyond "now". A provider
 * would have to wrap the tree and re-render it to carry a boolean that only
 * one component reads; this lets the floating rail and the residence cards
 * call a plain function and stay as dumb as they were.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Open the enquiry popup, from anywhere, without threading a prop to it. */
export function openEnquiry(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeEnquiry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
