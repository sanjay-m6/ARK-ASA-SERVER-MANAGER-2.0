import { useState } from 'react';
import { X, ArrowRight, Check } from 'lucide-react';

interface Props {
    onComplete: () => void;
}

const TOUR_STEPS = [
    {
        title: 'Welcome to ARK Server Manager!',
        description: 'Let\'s take a quick tour to get you started. This will only take 2 minutes.',
        image: '🎮',
    },
    {
        title: 'Server Manager',
        description: 'Install and manage your ARK: Survival Ascended servers here. Click "Install Server" to get started.',
        image: '🖥️',
    },
    {
        title: 'Mod Manager',
        description: 'Browse and install mods from Steam Workshop. Drag to reorder mod load priority.',
        image: '🧩',
    },
    {
        title: 'Config Editor',
        description: 'Visually edit server settings with sliders and toggles. No INI file editing needed!',
        image: '⚙️',
    },
    {
        title: 'Backups & Rollback',
        description: 'Automatic backups protect your server. Restore any backup with one click.',
        image: '💾',
    },
    {
        title: 'You\'re Ready!',
        description: 'You now know the basics. Start by installing your first server!',
        image: '🚀',
    },
];

export default function OnboardingTour({ onComplete }: Props) {
    const [step, setStep] = useState(0);

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
                    <span className="text-sm text-dark-400">Step {step + 1} of {TOUR_STEPS.length}</span>
                    <button onClick={handleSkip} className="text-dark-400 hover:text-white transition-colors">
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
                            ← Back
                        </button>
                    ) : (
                        <button
                            onClick={handleSkip}
                            className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                        >
                            Skip Tour
                        </button>
                    )}

                    <button
                        onClick={handleNext}
                        className="flex items-center space-x-2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                    >
                        <span>{step === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}</span>
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
