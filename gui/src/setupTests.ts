import '@testing-library/jest-dom';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveTextContent(text: string | RegExp): R;
      toBeVisible(): R;
      toBeHidden(): R;
      toBeDisabled(): R;
      toBeEnabled(): R;
      toBeEmptyDOMElement(): R;
      toContainElement(element: HTMLElement | null): R;
      toContainHTML(html: string): R;
      toHaveAttribute(name: string, value?: string): R;
      toHaveClass(className: string): R;
      toHaveStyle(css: string): R;
      toHaveFormValues(values: Record<string, any>): R;
      toBeChecked(): R;
      toHaveValue(value: string | number | string[]): R;
      toHaveDisplayValue(value: string | string[]): R;
      toBePartiallyChecked(): R;
      toHaveErrorMessage(message: string): R;
    }
  }
}

// jsdom does not implement scrollIntoView
// Provide a harmless stub so components calling it do not throw
// eslint-disable-next-line @typescript-eslint/no-empty-function
// @ts-ignore
Element.prototype.scrollIntoView = function () {};
