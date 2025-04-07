
import Image from 'next/image';
import HamiltonImage from '@/media/HamiltonFront1.jpeg';

export default function DottedFace(props: any) {
    return (
        <div className="flex justify-center items-center">
           <Image 
                src={HamiltonImage} 
                alt="Hamilton Portrait" 
                width={350}
                height={350}
                className="rounded-lg" // Optional: adds rounded corners
            />
        </div>
    );
}