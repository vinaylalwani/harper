// wait for a promise or plain object to resolve
export function when<T, R>(
	value: T | Promise<T>,
	callback: (value: T) => R,
	reject?: (error: any) => void
): R | Promise<R | void> {
	if ((value as Promise<T>)?.then) {
		return (value as Promise<T>).then(callback, reject);
	}
	return callback(value as T);
}
