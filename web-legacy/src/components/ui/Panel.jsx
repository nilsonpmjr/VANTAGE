import React from 'react';
import cn from '../../utils/cn';

export default function Panel({
    title,
    description,
    eyebrow,
    actions,
    children,
    className = '',
    contentClassName = '',
    as = 'section',
}) {
    const Component = as;

    return (
        <Component className={cn('v-panel', className)}>
            {(title || description || eyebrow || actions) && (
                <div className="v-panel__header">
                    <div>
                        {eyebrow ? <span className="v-panel__eyebrow">{eyebrow}</span> : null}
                        {title ? <h3 className="v-panel__title">{title}</h3> : null}
                        {description ? <p className="v-panel__description">{description}</p> : null}
                    </div>
                    {actions}
                </div>
            )}
            <div className={cn('v-panel__content', contentClassName)}>
                {children}
            </div>
        </Component>
    );
}
