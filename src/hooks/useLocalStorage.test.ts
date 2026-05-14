import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useLocalStorage from './useLocalStorage';

beforeEach(() => localStorage.clear());

describe('useLocalStorage', () => {
    describe('initial value', () => {
        it('returns initialValue when storage is empty', () => {
            const { result } = renderHook(() => useLocalStorage('k', 42));
            expect(result.current[0]).toBe(42);
        });

        it('reads pre-existing value from storage', () => {
            localStorage.setItem('k', JSON.stringify('hello'));
            const { result } = renderHook(() => useLocalStorage('k', 'default'));
            expect(result.current[0]).toBe('hello');
        });

        it('falls back to initialValue when stored JSON is malformed', () => {
            localStorage.setItem('k', 'not-valid-json{');
            const { result } = renderHook(() => useLocalStorage('k', 99));
            expect(result.current[0]).toBe(99);
        });
    });

    describe('setValue', () => {
        it('updates the returned state value', () => {
            const { result } = renderHook(() => useLocalStorage('k', 0));
            act(() => result.current[1](99));
            expect(result.current[0]).toBe(99);
        });

        it('persists the value to localStorage', () => {
            const { result } = renderHook(() => useLocalStorage('k', 0));
            act(() => result.current[1](99));
            expect(JSON.parse(localStorage.getItem('k')!)).toBe(99);
        });

        it('handles object values', () => {
            const { result } = renderHook(() => useLocalStorage('k', { a: 1 }));
            act(() => result.current[1]({ a: 2 }));
            expect(result.current[0]).toEqual({ a: 2 });
            expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ a: 2 });
        });

        it('handles array values', () => {
            const { result } = renderHook(() => useLocalStorage<number[]>('k', []));
            act(() => result.current[1]([1, 2, 3]));
            expect(result.current[0]).toEqual([1, 2, 3]);
        });
    });

    describe('key isolation', () => {
        it('two instances with different keys do not interfere', () => {
            const { result: a } = renderHook(() => useLocalStorage('a', 'alpha'));
            const { result: b } = renderHook(() => useLocalStorage('b', 'beta'));
            act(() => a.current[1]('updated-alpha'));
            expect(a.current[0]).toBe('updated-alpha');
            expect(b.current[0]).toBe('beta');
        });
    });
});
