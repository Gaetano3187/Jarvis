import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Footer43 = (props) => {
  return (
    <>
      <footer className="footer43-footer7 thq-section-padding">
        <div className="footer43-max-width thq-section-max-width">
          <div className="footer43-content">
            <div className="footer43-logo1">
              <img
                alt={props.logoAlt}
                src={props.logoSrc}
                className="footer43-logo2"
              />
            </div>
            <div className="footer43-links">
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link1 ?? (
                  <Fragment>
                    <span className="footer43-text18">Home</span>
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
                    <span className="footer43-text17">About Us</span>
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
                    <span className="footer43-text14">Services</span>
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
                    <span className="footer43-text20">Contact Us</span>
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
                    <span className="footer43-text16">FAQs</span>
                  </Fragment>
                )}
              </a>
            </div>
          </div>
          <div className="footer43-credits">
            <div className="thq-divider-horizontal"></div>
            <div className="footer43-row">
              <div className="footer43-container">
                <span className="thq-body-small">© 2024 TeleportHQ</span>
              </div>
              <div className="footer43-footer-links">
                <span className="footer43-text11 thq-body-small">
                  {props.privacyLink ?? (
                    <Fragment>
                      <span className="footer43-text21">Privacy Policy</span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.termsLink ?? (
                    <Fragment>
                      <span className="footer43-text19">
                        Terms and Conditions
                      </span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.cookiesLink ?? (
                    <Fragment>
                      <span className="footer43-text15">Cookies Policy</span>
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
          .footer43-footer7 {
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
          .footer43-max-width {
            gap: var(--dl-layout-space-threeunits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer43-content {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer43-logo1 {
            gap: 24px;
            display: flex;
            overflow: hidden;
            align-items: flex-start;
            flex-direction: column;
          }
          .footer43-logo2 {
            height: 2rem;
          }
          .footer43-links {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: flex-start;
          }
          .footer43-credits {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .footer43-row {
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
            justify-content: space-between;
          }
          .footer43-container {
            display: flex;
            align-items: flex-start;
          }
          .footer43-footer-links {
            gap: 24px;
            display: flex;
            align-items: flex-start;
          }
          .footer43-text11 {
            fill: var(--dl-color-theme-neutral-dark);
            color: var(--dl-color-theme-neutral-dark);
          }
          .footer43-text14 {
            display: inline-block;
          }
          .footer43-text15 {
            display: inline-block;
          }
          .footer43-text16 {
            display: inline-block;
          }
          .footer43-text17 {
            display: inline-block;
          }
          .footer43-text18 {
            display: inline-block;
          }
          .footer43-text19 {
            display: inline-block;
          }
          .footer43-text20 {
            display: inline-block;
          }
          .footer43-text21 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .footer43-row {
              gap: var(--dl-layout-space-oneandhalfunits);
              align-items: center;
              flex-direction: column;
              justify-content: center;
            }
          }
          @media (max-width: 479px) {
            .footer43-max-width {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
            .footer43-links {
              flex-direction: column;
            }
            .footer43-footer-links {
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

Footer43.defaultProps = {
  link3: undefined,
  cookiesLink: undefined,
  link5: undefined,
  link2: undefined,
  link1: undefined,
  logoSrc: 'https://presentation-website-assets.teleporthq.io/logos/logo.png',
  termsLink: undefined,
  logoAlt: 'Company Logo',
  link4: undefined,
  privacyLink: undefined,
}

Footer43.propTypes = {
  link3: PropTypes.element,
  cookiesLink: PropTypes.element,
  link5: PropTypes.element,
  link2: PropTypes.element,
  link1: PropTypes.element,
  logoSrc: PropTypes.string,
  termsLink: PropTypes.element,
  logoAlt: PropTypes.string,
  link4: PropTypes.element,
  privacyLink: PropTypes.element,
}

export default Footer43
