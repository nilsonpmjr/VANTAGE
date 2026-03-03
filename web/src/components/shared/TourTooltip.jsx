import React, { useEffect, useRef, useState } from 'react';
import { useTour } from '../../context/TourContext';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';

const TOOLTIP_GAP = 16; // px between tooltip and spotlight edge
const TOOLTIP_MAX_WIDTH = 360;

/**
 * TourTooltip
 *
 * Dynamically-positioned tooltip that renders next to the spotlighted element.
 * Automatically flips position when there's not enough room.
 */
export default function TourTooltip({ targetRect }) {
    const { t } = useTranslation();
    const {
        currentStep,
        currentStepIndex,
        totalSteps,
        nextStep,
        prevStep,
        skipTour,
    } = useTour();

    const tooltipRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const [actualPosition, setActualPosition] = useState('bottom');

    useEffect(() => {
        if (!tooltipRef.current || !targetRect || !currentStep) return;

        const tt = tooltipRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Spotlight rect (with padding already applied by overlay)
        const sr = {
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
        };
        sr.bottom = sr.top + sr.height;
        sr.right = sr.left + sr.width;

        let preferred = currentStep.position || 'bottom';

        // Space available in each direction
        const spaceBottom = vh - sr.bottom - TOOLTIP_GAP;
        const spaceTop = sr.top - TOOLTIP_GAP;
        const spaceRight = vw - sr.right - TOOLTIP_GAP;
        const spaceLeft = sr.left - TOOLTIP_GAP;

        // Attempt preferred, flip if not enough space
        if (preferred === 'bottom' && spaceBottom < tt.height) preferred = 'top';
        if (preferred === 'top' && spaceTop < tt.height) preferred = 'bottom';
        if (preferred === 'right' && spaceRight < tt.width) preferred = 'left';
        if (preferred === 'left' && spaceLeft < tt.width) preferred = 'right';

        let top = 0;
        let left = 0;

        switch (preferred) {
            case 'bottom':
                top = sr.bottom + TOOLTIP_GAP;
                left = sr.left + sr.width / 2 - tt.width / 2;
                break;
            case 'top':
                top = sr.top - TOOLTIP_GAP - tt.height;
                left = sr.left + sr.width / 2 - tt.width / 2;
                break;
            case 'right':
                top = sr.top + sr.height / 2 - tt.height / 2;
                left = sr.right + TOOLTIP_GAP;
                break;
            case 'left':
                top = sr.top + sr.height / 2 - tt.height / 2;
                left = sr.left - TOOLTIP_GAP - tt.width;
                break;
            default:
                top = sr.bottom + TOOLTIP_GAP;
                left = sr.left;
        }

        // Clamp inside viewport
        left = Math.max(12, Math.min(left, vw - tt.width - 12));
        top = Math.max(12, Math.min(top, vh - tt.height - 12));

        setPos({ top, left });
        setActualPosition(preferred);
    }, [targetRect, currentStep]);

    if (!currentStep) return null;

    const isFirst = currentStepIndex === 0;
    const isLast = currentStepIndex === totalSteps - 1;

    return (
        <div
            ref={tooltipRef}
            className={`tour-tooltip tour-tooltip--${actualPosition}`}
            style={{
                top: pos.top,
                left: pos.left,
                maxWidth: TOOLTIP_MAX_WIDTH,
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t(currentStep.titleKey)}
        >
            {/* Close button */}
            <button
                className="tour-tooltip__close"
                onClick={skipTour}
                aria-label={t('tour.skip')}
                title={t('tour.skip')}
            >
                <X size={16} />
            </button>

            {/* Content */}
            <h4 className="tour-tooltip__title">{t(currentStep.titleKey)}</h4>
            <p className="tour-tooltip__desc">{t(currentStep.descKey)}</p>

            {/* Footer */}
            <div className="tour-tooltip__footer">
                {/* Progress dots */}
                <div className="tour-tooltip__dots">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                        <span
                            key={i}
                            className={`tour-tooltip__dot ${i === currentStepIndex ? 'active' : ''}`}
                        />
                    ))}
                </div>

                {/* Navigation */}
                <div className="tour-tooltip__nav">
                    {!isFirst && (
                        <button className="tour-tooltip__btn tour-tooltip__btn--ghost" onClick={prevStep}>
                            <ChevronLeft size={16} />
                            {t('tour.prev')}
                        </button>
                    )}
                    <button className="tour-tooltip__btn tour-tooltip__btn--primary" onClick={nextStep}>
                        {isLast ? t('tour.finish') : t('tour.next')}
                        {!isLast && <ChevronRight size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
