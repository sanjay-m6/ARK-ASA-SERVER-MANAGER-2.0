import { useState } from 'react';
import { X, ArrowRight, Check } from 'lucide-react';

import { useTranslation } from 'react-i18next';

interface Props {
    onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: Props) {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);

    const TOUR_STEPS = [
        {
            title: t('onboarding.steps.welcome.title'),
            description: t('onboarding.steps.welcome.description'),
            image: '🎮',
        },
        {
            title: t('onboarding.steps.manager.title'),
            description: t('onboarding.steps.manager.description'),
            image: '🖥️',
        },
        {
            title: t('onboarding.steps.mods.title'),
            description: t('onboarding.steps.mods.description'),
            image: '🧩',
        },
        {
            title: t('onboarding.steps.config.title'),
            description: t('onboarding.steps.config.description'),
            image: '⚙️',
        },
        {
            title: t('onboarding.steps.backups.title'),
            description: t('onboarding.steps.backups.description'),
            image: '💾',
        },
        {
            title: t('onboarding.steps.ready.title'),
            description: t('onboarding.steps.ready.description'),
            image: '🚀',
        },
    ];



    const handleNext = () => {
        if (step < TOUR_STEPS.length - 1) {
            setStep(step + 1);
        } else {
            onComplete();
        }
    };

    const handleSkip = () => {
        onComplete();
    };

    const currentStep = TOUR_STEPS[step];

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-dark-900 border border-dark-800 rounded-xl w-full max-w-lg p-8">
                {/* Progress */}
                <div className="flex items-center justify-between mb-6">
                    <span className="text-sm text-dark-400">{t('onboarding.step', { current: step + 1, total: TOUR_STEPS.length })}</span>
                    <button onClick={handleSkip} className="text-dark-400 hover:text-white transition-colors" title={t('onboarding.skip')}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="w-full bg-dark-800 rounded-full h-2 mb-8">
                    <div
                        className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
                    />
                </div>

                {/* Content */}
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">{currentStep.image}</div>
                    <h2 className="text-2xl font-bold text-white mb-3">{currentStep.title}</h2>
                    <p className="text-dark-300">{currentStep.description}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    {step > 0 ? (
                        <button
                            onClick={() => setStep(step - 1)}
                            className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                        >
                            {t('onboarding.back')}
                        </button>
                    ) : (
                        <button
                            onClick={handleSkip}
                            className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                        >
                            {t('onboarding.skip')}
                        </button>
                    )}

                    <button
                        onClick={handleNext}
                        className="flex items-center space-x-2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                    >
                        <span>{step === TOUR_STEPS.length - 1 ? t('onboarding.start') : t('onboarding.next')}</span>
                        {step === TOUR_STEPS.length - 1 ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <ArrowRight className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
