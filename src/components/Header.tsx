import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <path fill="#E76F51" d="M22 5v25H5z" />
            <path fill="#2A9D8F" d="M25 8v22h17z" />
            <path fill="#284F48" d="M22 9h3v21h-9z" />
            <path fill="#E76F51" d="M6 31h36l-4 5H11z" />
            <path fill="#2A9D8F" d="M4 40q7-4 14 0t14 0q7-4 13 0-7 1-13 4-7-3-14 0-7-4-14-4z" />
          </svg>
        </span>{' '}
        Passage Review<span className="brand-tag">RESEARCH WORKSPACE</span>
      </Link>
      <div className="topbar-actions">
        <a
          href="https://github.com/ashish2508/major-project"
          target="_blank"
          rel="noreferrer"
          className="repo-link"
        >
          <Image src="/cd.png" alt="GitHub" width={30} height={30} />
        </a>
      </div>
    </header>
  );
}
