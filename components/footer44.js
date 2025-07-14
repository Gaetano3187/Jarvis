import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Footer44 = (props) => {
  return (
    <>
      <footer className="footer44-footer7 thq-section-padding">
        <div className="footer44-max-width thq-section-max-width">
          <div className="footer44-content">
            <div className="footer44-logo1">
              <img
                alt={props.logoAlt}
                src={props.logoSrc}
                className="footer44-logo2"
              />
            </div>
            <div className="footer44-links">
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link1 ?? (
                  <Fragment>
                    <span className="footer44-text15">About Us</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link2 ?? (
                  <Fragment>
                    <span className="footer44-text21">Contact Us</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link3 ?? (
                  <Fragment>
                    <span className="footer44-text20">FAQs</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link4 ?? (
                  <Fragment>
                    <span className="footer44-text14">Terms of Service</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link5 ?? (
                  <Fragment>
                    <span className="footer44-text16">Privacy Policy</span>
                  </Fragment>
                )}
              </a>
            </div>
          </div>
          <div className="footer44-credits">
            <div className="thq-divider-horizontal"></div>
            <div className="footer44-row">
              <div className="footer44-container">
                <span className="thq-body-small">© 2024 TeleportHQ</span>
              </div>
              <div className="footer44-footer-links">
                <span className="footer44-text11 thq-body-small">
                  {props.privacyLink ?? (
                    <Fragment>
                      <span className="footer44-text18">Privacy Policy</span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.termsLink ?? (
                    <Fragment>
                      <span className="footer44-text19">Terms of Service</span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.cookiesLink ?? (
                    <Fragment>
                      <span className="footer44-text17">Cookies Policy</span>
                    </Fragment>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
      <style jsx>
        {`
          .footer44-footer7 {
            width: 100%;
            height: auto;
            display: flex;
            overflow: hidden;
            position: relative;
            align-items: center;
            flex-shrink: 0;
            flex-direction: column;
            justify-content: center;
          }
          .footer44-max-width {
            gap: var(--dl-layout-space-threeunits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer44-content {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer44-logo1 {
            gap: 24px;
            display: flex;
            overflow: hidden;
            align-items: flex-start;
            flex-direction: column;
          }
          .footer44-logo2 {
            height: 2rem;
          }
          .footer44-links {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: flex-start;
          }
          .footer44-credits {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .footer44-row {
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
            justify-content: space-between;
          }
          .footer44-container {
            display: flex;
            align-items: flex-start;
          }
          .footer44-footer-links {
            gap: 24px;
            display: flex;
            align-items: flex-start;
          }
          .footer44-text11 {
            fill: var(--dl-color-theme-neutral-dark);
            color: var(--dl-color-theme-neutral-dark);
          }
          .footer44-text14 {
            display: inline-block;
          }
          .footer44-text15 {
            display: inline-block;
          }
          .footer44-text16 {
            display: inline-block;
          }
          .footer44-text17 {
            display: inline-block;
          }
          .footer44-text18 {
            display: inline-block;
          }
          .footer44-text19 {
            display: inline-block;
          }
          .footer44-text20 {
            display: inline-block;
          }
          .footer44-text21 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .footer44-row {
              gap: var(--dl-layout-space-oneandhalfunits);
              align-items: center;
              flex-direction: column;
              justify-content: center;
            }
          }
          @media (max-width: 479px) {
            .footer44-max-width {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
            .footer44-links {
              flex-direction: column;
            }
            .footer44-footer-links {
              align-items: center;
              flex-direction: column;
              justify-content: center;
            }
          }
        `}
      </style>
    </>
  )
}

Footer44.defaultProps = {
  link4: undefined,
  link1: undefined,
  link5: undefined,
  logoSrc: 'https://presentation-website-assets.teleporthq.io/logos/logo.png',
  cookiesLink: undefined,
  privacyLink: undefined,
  termsLink: undefined,
  logoAlt: 'Company Logo',
  link3: undefined,
  link2: undefined,
}

Footer44.propTypes = {
  link4: PropTypes.element,
  link1: PropTypes.element,
  link5: PropTypes.element,
  logoSrc: PropTypes.string,
  cookiesLink: PropTypes.element,
  privacyLink: PropTypes.element,
  termsLink: PropTypes.element,
  logoAlt: PropTypes.string,
  link3: PropTypes.element,
  link2: PropTypes.element,
}

export default Footer44
