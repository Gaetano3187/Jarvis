import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Footer41 = (props) => {
  return (
    <>
      <footer className="footer41-footer7 thq-section-padding">
        <div className="footer41-max-width thq-section-max-width">
          <div className="footer41-content">
            <div className="footer41-logo1">
              <img
                alt={props.logoAlt}
                src={props.logoSrc}
                className="footer41-logo2"
              />
            </div>
            <div className="footer41-links">
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link1 ?? (
                  <Fragment>
                    <span className="footer41-text19">Home</span>
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
                    <span className="footer41-text17">About Us</span>
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
                    <span className="footer41-text15">Services</span>
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
                    <span className="footer41-text20">Contact Us</span>
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
                    <span className="footer41-text14">FAQs</span>
                  </Fragment>
                )}
              </a>
            </div>
          </div>
          <div className="footer41-credits">
            <div className="thq-divider-horizontal"></div>
            <div className="footer41-row">
              <div className="footer41-container">
                <span className="thq-body-small">© 2024 TeleportHQ</span>
              </div>
              <div className="footer41-footer-links">
                <span className="footer41-text11 thq-body-small">
                  {props.privacyLink ?? (
                    <Fragment>
                      <span className="footer41-text16">Privacy Policy</span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.termsLink ?? (
                    <Fragment>
                      <span className="footer41-text21">
                        Terms and Conditions
                      </span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.cookiesLink ?? (
                    <Fragment>
                      <span className="footer41-text18">Cookies Policy</span>
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
          .footer41-footer7 {
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
          .footer41-max-width {
            gap: var(--dl-layout-space-threeunits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer41-content {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer41-logo1 {
            gap: 24px;
            display: flex;
            overflow: hidden;
            align-items: flex-start;
            flex-direction: column;
          }
          .footer41-logo2 {
            height: 2rem;
          }
          .footer41-links {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: flex-start;
          }
          .footer41-credits {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .footer41-row {
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
            justify-content: space-between;
          }
          .footer41-container {
            display: flex;
            align-items: flex-start;
          }
          .footer41-footer-links {
            gap: 24px;
            display: flex;
            align-items: flex-start;
          }
          .footer41-text11 {
            fill: var(--dl-color-theme-neutral-dark);
            color: var(--dl-color-theme-neutral-dark);
          }
          .footer41-text14 {
            display: inline-block;
          }
          .footer41-text15 {
            display: inline-block;
          }
          .footer41-text16 {
            display: inline-block;
          }
          .footer41-text17 {
            display: inline-block;
          }
          .footer41-text18 {
            display: inline-block;
          }
          .footer41-text19 {
            display: inline-block;
          }
          .footer41-text20 {
            display: inline-block;
          }
          .footer41-text21 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .footer41-row {
              gap: var(--dl-layout-space-oneandhalfunits);
              align-items: center;
              flex-direction: column;
              justify-content: center;
            }
          }
          @media (max-width: 479px) {
            .footer41-max-width {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
            .footer41-links {
              flex-direction: column;
            }
            .footer41-footer-links {
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

Footer41.defaultProps = {
  logoSrc: 'https://presentation-website-assets.teleporthq.io/logos/logo.png',
  link5: undefined,
  link3: undefined,
  privacyLink: undefined,
  logoAlt: 'Company Logo',
  link2: undefined,
  cookiesLink: undefined,
  link1: undefined,
  link4: undefined,
  termsLink: undefined,
}

Footer41.propTypes = {
  logoSrc: PropTypes.string,
  link5: PropTypes.element,
  link3: PropTypes.element,
  privacyLink: PropTypes.element,
  logoAlt: PropTypes.string,
  link2: PropTypes.element,
  cookiesLink: PropTypes.element,
  link1: PropTypes.element,
  link4: PropTypes.element,
  termsLink: PropTypes.element,
}

export default Footer41
