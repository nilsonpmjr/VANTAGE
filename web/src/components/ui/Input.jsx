import React from 'react';
import cn from '../../utils/cn';

export default function Input({ className = '', multiline = false, ...props }) {
    if (multiline) {
        return <textarea className={cn('v-input', 'v-input--textarea', className)} {...props} />;
    }

    return <input className={cn('v-input', className)} {...props} />;
}
