import VoiceRecorder from '../components/VoiceRecorder';
import LectureGallery from '../components/LectureGallery';

const LectureRecorderPage = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-black transition-colors duration-300">
            <VoiceRecorder />
            <div className="max-w-5xl mx-auto px-6 pb-12">
                <LectureGallery />
            </div>
        </div>
    );
};

export default LectureRecorderPage;
