import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTour } from '../../context/TourContext';
import TourTooltip from './TourTooltip';

/**
 * TourOverlay
 *
 * Renders a full-screen dark backdrop with a "spotlight" cutout around the
 * currently-targeted element.  The cutout is achieved with a huge box-shadow
 * on a positioned clone element, which is simpler and more performant than
 * clip-path recalculations.
 */
export default function TourOverlay() {
    const { isTourActive, currentStep } = useTour();
    const [rect, setRect] = useState(null);
    const [visible, setVisible] = useState(false);

    const rafRef = useRef(null);

    /** Find the target element and measure it. */
    const measure = useCallback(() => {
        if (!currentStep) { setRect(null); return; }
        const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
        if (!el) { setRect(null); return; }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, [currentStep]);

    // Re-measure on step change, scroll and resize
    useEffect(() => {
        if (!isTourActive) { setVisible(false); return; }

        // Small delay so the DOM can settle (e.g. sidebar expanding)
        const timer = setTimeout(() => {
            measure();
            setVisible(true);
        }, 150);

        const handleUpdate = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(measure);
        };

        window.addEventListener('resize', handleUpdate);
        window.addEventListener('scroll', handleUpdate, true);

        return () => {
            clearTimeout(timer);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', handleUpdate);
            window.removeEventListener('scroll', handleUpdate, true);
        };
    }, [isTourActive, currentStep, measure]);

    if (!isTourActive || !visible) return null;

    return (
        <div className="tour-overlay" role="presentation">
            {/* Spotlight cutout */}
            {rect && (
                <div
                    className="tour-spotlight"
                    style={{
                        top: rect.top - 6,
                        left: rect.left - 6,
                        width: rect.width + 12,
                        height: rect.height + 12,
                    }}
                />
            )}

            {/* Tooltip */}
            {rect && <TourTooltip targetRect={rect} />}
        </div>
    );
}
