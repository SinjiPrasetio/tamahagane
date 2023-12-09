import { useEffect } from 'react';

function Home() {
  useEffect(() => {
    const readGrfFile = async (grfPath) => {
      try {
        const data = await window.ipc.invoke('open-grf-file', grfPath);
        console.log(data);
      } catch (error) {
        console.error('Error reading GRF file:', error);
      }
    };

    if (typeof window !== 'undefined' && window.ipc) {
      readGrfFile(
        '/Users/sinjiprasetio/Documents/Coding/tamahagane/resources/test/200-small.grf'
      );
    }
  }, []);

  return (
    <div>
      <button
        className="px-4 py-2 bg-indigo-500 rounded-lg hover:bg-indigo-700"
        onClick={() => console.log('clicked')}
      >
        Home
      </button>
      <div>Try</div>
    </div>
  );
}

export default Home;
